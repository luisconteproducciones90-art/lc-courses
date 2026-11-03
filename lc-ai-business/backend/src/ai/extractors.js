'use strict';
// Extracción de texto por formato. Para sumar DOCX/XLSX/imágenes (Fase 2) basta registrar un extractor.
const { E } = require('../lib/httpError');

const MAX_TEXT = 500_000;

function decodeUtf8(buf) {
  const t = buf.toString('utf8');
  if (t.includes('\u0000')) throw E.unsupported('El archivo parece binario y no es texto válido');
  return t;
}

const EXT = {
  txt: async (b) => ({ text: decodeUtf8(b) }),
  md: async (b) => ({ text: decodeUtf8(b) }),
  csv: async (b) => ({ text: decodeUtf8(b), csv: true }),
  pdf: async (b) => {
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
    } catch (e) {
      throw E.unsupported('No se pudo leer el PDF (protegido, escaneado o con formato no compatible). Probá exportarlo como texto.');
    }
  },
};

async function extract(filename, buffer) {
  const ext = String(filename).toLowerCase().split('.').pop();
  const fn = EXT[ext];
  if (!fn) throw E.unsupported(`Formato .${ext} no soportado todavía. Hoy: ${Object.keys(EXT).join(', ')} o texto pegado (DOCX/XLSX/imágenes en Fase 2).`);
  const out = await fn(buffer);
  const text = out.text.slice(0, MAX_TEXT).trim();
  if (!text) throw E.badRequest('No se pudo extraer texto del documento');
  return { ...out, text };
}

module.exports = { extract, SUPPORTED: Object.keys(EXT) };
