'use strict';
// Divide texto en fragmentos (~900 caracteres) respetando párrafos. CSV: repite la cabecera en cada fragmento.
const MAX = 900;
const OVERLAP = 120;
const MAX_CHUNKS = 600;

function splitLong(par) {
  const out = [];
  let i = 0;
  while (i < par.length) {
    let end = Math.min(i + MAX, par.length);
    if (end < par.length) {
      const cut = par.lastIndexOf(' ', end);
      if (cut > i + MAX * 0.5) end = cut;
    }
    out.push(par.slice(i, end).trim());
    if (end >= par.length) break;
    i = Math.max(end - OVERLAP, i + 1);
  }
  return out;
}

function chunkText(text) {
  const pars = String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of pars) {
    if (p.length > MAX) {
      if (cur) { chunks.push(cur); cur = ''; }
      chunks.push(...splitLong(p));
    } else if ((cur + '\n\n' + p).length > MAX && cur) {
      chunks.push(cur); cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.slice(0, MAX_CHUNKS);
}

function chunkCsv(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return chunkText(text);
  const header = lines[0];
  const chunks = [];
  let cur = [];
  let len = header.length;
  for (const line of lines.slice(1)) {
    if (len + line.length + 1 > MAX && cur.length) {
      chunks.push(`${header}\n${cur.join('\n')}`);
      cur = []; len = header.length;
    }
    cur.push(line); len += line.length + 1;
  }
  if (cur.length) chunks.push(`${header}\n${cur.join('\n')}`);
  return chunks.slice(0, MAX_CHUNKS);
}

module.exports = { chunkText, chunkCsv, MAX_CHUNKS };
