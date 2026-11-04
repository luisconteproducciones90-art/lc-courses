'use strict';
// Embeddings para búsqueda semántica. Proveedores:
//  - openai: text-embedding-3-small (semántica real: sinónimos, paráfrasis). Requiere OPENAI_API_KEY en el servidor.
//  - local : hashing de palabras y trigramas de caracteres (offline). NO es semántica real: tolera errores de
//            tipeo, plurales y acentos, pero no entiende sinónimos. Sirve de base cuando no hay proveedor.
// Cada fragmento guarda el modelo con que se calculó: nunca se comparan vectores de modelos distintos.
const env = require('../config/env');
const db = require('../db/pool');
const log = require('../lib/logger');
const { safeFetch } = require('../lib/ssrf');

let transport = (url, opts) => safeFetch(url, opts); // inyectable en tests
const setTransport = (f) => { transport = f; };

const LOCAL_DIMS = 384;
const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const norm = (v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map((x) => x / n); };

function localEmbed(text) {
  const words = (String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{2,}/g) || []).slice(0, 400);
  const v = new Array(LOCAL_DIMS).fill(0);
  const add = (feat, w) => { const h = fnv(feat); v[h % LOCAL_DIMS] += (h & 0x80000000 ? -1 : 1) * w; };
  for (const w of words) {
    add(`w:${w}`, 1);
    const p = `^${w}$`;
    for (let i = 0; i + 3 <= p.length; i += 1) add(`g:${p.slice(i, i + 3)}`, 0.5);
  }
  return norm(v);
}

const PROVIDERS = {
  local: { id: 'local-hash-384', dims: LOCAL_DIMS, minSim: 0.15, configured: () => true, batch: 256, async embed(texts) { return texts.map(localEmbed); } },
  openai: {
    id: () => `openai:${env.embeddings.openaiModel}`, dims: 1536, minSim: 0.3, configured: () => !!env.ai.openai.key, batch: 64,
    async embed(texts) {
      const r = await transport('https://api.openai.com/v1/embeddings', { method: 'POST', timeoutMs: 20000, maxBytes: 8 * 1024 * 1024, headers: { authorization: `Bearer ${env.ai.openai.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: env.embeddings.openaiModel, input: texts.map((t) => String(t).slice(0, 8000)) }) });
      if (r.status !== 200) throw new Error(`embeddings HTTP ${r.status}`);
      const j = JSON.parse(r.body.toString('utf8'));
      return j.data.sort((a, b) => a.index - b.index).map((d) => norm(d.embedding));
    },
  },
};
const modelId = (p) => (typeof p.id === 'function' ? p.id() : p.id);

async function resolve() {
  let wanted = env.embeddings.provider;
  try { const [row] = await db.system((q) => q("SELECT value FROM settings WHERE company_id IS NULL AND key = 'embeddings'")); if (row?.value?.provider) wanted = row.value.provider; } catch { /* sin setting */ }
  if (!PROVIDERS[wanted] || !PROVIDERS[wanted].configured()) wanted = PROVIDERS.openai.configured() && !wanted ? 'openai' : 'local';
  const p = PROVIDERS[wanted];
  return { name: wanted, model: modelId(p), dims: p.dims, minSim: p.minSim, semantic: wanted !== 'local', provider: p };
}

async function embedAll(provider, texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += provider.batch) out.push(...(await provider.embed(texts.slice(i, i + provider.batch))));
  return out;
}

/** Vectores para fragmentos nuevos. Devuelve {model, vectors|null}: si falla, se indexa solo por palabras. */
async function embedDocuments(texts) {
  const r = await resolve();
  try { return { model: r.model, vectors: await embedAll(r.provider, texts), tokens: r.semantic ? Math.ceil(texts.join('').length / 4) : 0, name: r.name }; }
  catch (e) { log.warn('embeddings fallaron; se indexa solo por palabras', { err: e.message }); return { model: r.model, vectors: null, tokens: 0, name: r.name }; }
}

const cache = new Map();
/** Vector de una consulta (con caché corta). null si el proveedor falla. */
async function embedQuery(text) {
  const r = await resolve();
  const key = `${r.model}|${text}`;
  if (cache.has(key)) return { vector: cache.get(key), ...r };
  try {
    const [v] = await embedAll(r.provider, [String(text).slice(0, 2000)]);
    cache.set(key, v); if (cache.size > 200) cache.delete(cache.keys().next().value);
    return { vector: v, ...r };
  } catch (e) { log.warn('embedding de consulta falló', { err: e.message }); return { vector: null, ...r }; }
}

module.exports = { resolve, embedDocuments, embedQuery, setTransport, localEmbed, PROVIDERS, LOCAL_DIMS, embedAll };
