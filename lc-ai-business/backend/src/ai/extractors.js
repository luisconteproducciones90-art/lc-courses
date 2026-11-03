'use strict';
// Extracción de texto por formato. Para sumar un formato basta registrar un extractor.
const { unzipSync, strFromU8 } = require('fflate');
const { E } = require('../lib/httpError');
const { safeFetch } = require('../lib/ssrf');

const MAX_TEXT = 500_000;
const MAX_UNZIPPED = 30 * 1024 * 1024; // defensa contra zip bombs

function decodeUtf8(buf) {
  const t = buf.toString('utf8');
  if (t.includes('\u0000')) throw E.unsupported('El archivo parece binario y no es texto válido');
  return t;
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[e] ?? m;
});

function openZip(b, wanted) {
  if (b.slice(0, 2).toString('latin1') !== 'PK') throw E.unsupported('El archivo no es un documento Office válido');
  let total = 0;
  try { return unzipSync(new Uint8Array(b), { filter: (f) => { if (!wanted(f.name)) return false; total += f.originalSize; if (total > MAX_UNZIPPED) throw new Error('zip demasiado grande'); return true; } }); }
  catch { throw E.unsupported('No se pudo leer el documento (dañado o demasiado grande)'); }
}

function docx(b) {
  const files = openZip(b, (n) => n === 'word/document.xml');
  const xml = files['word/document.xml'];
  if (!xml) throw E.unsupported('DOCX sin contenido');
  const text = unescapeXml(strFromU8(xml).replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n\n').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, ''));
  return { text };
}

const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
function xlsx(b) {
  const files = openZip(b, (n) => n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared = [];
  if (files['xl/sharedStrings.xml']) for (const si of strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unescapeXml([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')));
  const names = files['xl/workbook.xml'] ? [...strFromU8(files['xl/workbook.xml']).matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => unescapeXml(m[1])) : [];
  const parts = [];
  Object.keys(files).filter((n) => n.startsWith('xl/worksheets/')).sort((a, c) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(c.match(/(\d+)\.xml/)[1], 10)).forEach((name, si) => {
    const rows = [];
    for (const r of strFromU8(files[name]).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+\d+)"/.exec(c[1]); const t = /t="(\w+)"/.exec(c[1])?.[1];
        const inner = c[2] || ''; const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let val = '';
        if (t === 's' && v !== undefined) val = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') val = unescapeXml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
        else if (v !== undefined) val = unescapeXml(v);
        if (ref) cells[colIndex(ref[1])] = String(val).replace(/[\r\n,]+/g, ' ');
      }
      if (cells.some((x) => x)) rows.push(Array.from(cells, (x) => x ?? '').join(','));
    }
    if (rows.length) parts.push({ text: rows.join('\n'), csv: true, label: names[si] || `Hoja ${si + 1}` });
  });
  if (!parts.length) throw E.badRequest('La planilla no tiene datos');
  return { text: parts.map((p) => `${p.label}\n${p.text}`).join('\n\n'), parts };
}

async function pdf(b) {
  if (b.slice(0, 5).toString('latin1') !== '%PDF-') throw E.unsupported('El archivo no es un PDF válido');
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(b), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
    const pages = Math.min(doc.numPages, 200);
    let text = '';
    for (let i = 1; i <= pages; i += 1) {
      const tc = await (await doc.getPage(i)).getTextContent();
      text += `${tc.items.map((it) => it.str + (it.hasEOL ? '\n' : '')).join(' ')}\n\n`;
      if (text.length > MAX_TEXT) break;
    }
    await doc.destroy();
    return { text };
  } catch { throw E.unsupported('No se pudo leer el PDF (protegido, escaneado o con formato no compatible). Probá exportarlo como texto.'); }
}

const EXT = {
  txt: async (b) => ({ text: decodeUtf8(b) }), md: async (b) => ({ text: decodeUtf8(b) }),
  csv: async (b) => ({ text: decodeUtf8(b), csv: true }), pdf, docx: async (b) => docx(b), xlsx: async (b) => xlsx(b),
};

async function extract(filename, buffer) {
  const ext = String(filename).toLowerCase().split('.').pop();
  const fn = EXT[ext];
  if (!fn) throw E.unsupported(`Formato .${ext} no soportado. Disponibles: ${Object.keys(EXT).join(', ')}, texto pegado o URL. Las imágenes requieren OCR (no incluido).`);
  const out = await fn(buffer);
  const text = out.text.slice(0, MAX_TEXT).trim();
  if (!text) throw E.badRequest('No se pudo extraer texto del documento');
  return { ...out, text };
}

/** Descarga una página web (con protección SSRF) y devuelve su texto visible. */
async function fromUrl(url) {
  let target = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const r = await safeFetch(target, { headers: { 'user-agent': 'LC-AI-BUSINESS-Bot/1.0', accept: 'text/html,text/plain' } }).catch((e) => { throw e.status ? e : E.badRequest(`No se pudo descargar la URL: ${e.message}`); });
    if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.location) { target = new URL(r.headers.location, target).toString(); continue; }
    if (r.status !== 200) throw E.badRequest(`La URL respondió ${r.status}`);
    const type = String(r.headers['content-type'] || '');
    if (!/text\/(html|plain)/i.test(type)) throw E.unsupported('Solo se admiten páginas HTML o texto');
    let t = r.body.toString('utf8');
    if (/html/i.test(type)) t = unescapeXml(t.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|h\d|li|tr|br)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n');
    t = t.trim().slice(0, MAX_TEXT);
    if (t.length < 20) throw E.badRequest('La página no tiene texto utilizable');
    return { text: t, finalUrl: target };
  }
  throw E.badRequest('Demasiadas redirecciones');
}

module.exports = { extract, fromUrl, SUPPORTED: Object.keys(EXT) };
