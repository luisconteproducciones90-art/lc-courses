'use strict';
const db = require('../db/pool');
const embeddings = require('../ai/embeddings');

/** Inserta fragmentos con su vector (si hay). q: consulta con contexto de tenant. */
async function insertChunks(q, companyId, documentId, chunks, emb) {
  for (let i = 0; i < chunks.length; i += 1) {
    const vec = emb?.vectors?.[i] || null;
    await q('INSERT INTO knowledge_chunks (company_id, document_id, ordinal, content, embedding, embedding_model) VALUES ($1,$2,$3,$4,$5,$6)',
      [companyId, documentId, i, chunks[i], vec, vec ? emb.model : null]);
  }
}

/** Registra el consumo de embeddings pagos (aprox. 1 token cada 4 caracteres) para los límites del plan. */
async function recordUsage(q, companyId, emb) {
  if (emb?.tokens) await q('INSERT INTO usage (company_id, provider, model, tokens_in, tokens_out) VALUES ($1,$2,$3,$4,0)', [companyId, `${emb.name}-embeddings`, emb.model, emb.tokens]);
}

let pgv = null;
async function hasPgvector() {
  if (pgv === null) { try { const [r] = await db.system((q) => q("SELECT 1 AS ok FROM pg_extension WHERE extname = 'vector'")); pgv = !!r; } catch { pgv = false; } }
  return pgv;
}
const resetPgvectorCache = () => { pgv = null; };

/** Re-calcula los vectores de los fragmentos sin índice o con otro modelo. Máx. `max` por llamada. */
async function reindex(companyId, max = 2000) {
  const r = await embeddings.resolve();
  const rows = await db.tenant(companyId, (q) => q('SELECT id, content FROM knowledge_chunks WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM $1 ORDER BY created_at LIMIT $2', [r.model, max]));
  if (!rows.length) return { reindexed: 0, remaining: 0, model: r.model };
  const vectors = await embeddings.embedAll(r.provider, rows.map((x) => x.content));
  await db.tenant(companyId, async (q) => {
    for (let i = 0; i < rows.length; i += 1) await q('UPDATE knowledge_chunks SET embedding = $2, embedding_model = $3 WHERE id = $1', [rows[i].id, vectors[i], r.model]);
    await recordUsage(q, companyId, { tokens: r.semantic ? Math.ceil(rows.map((x) => x.content).join('').length / 4) : 0, name: r.name, model: r.model });
  });
  const [{ n }] = await db.tenant(companyId, (q) => q('SELECT count(*)::int n FROM knowledge_chunks WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM $1', [r.model]));
  return { reindexed: rows.length, remaining: n, model: r.model };
}

async function status(companyId) {
  const r = await embeddings.resolve();
  const [s] = await db.tenant(companyId, (q) => q("SELECT count(*)::int total, count(*) FILTER (WHERE embedding IS NOT NULL AND embedding_model = $1)::int indexed FROM knowledge_chunks", [r.model]));
  return { provider: r.name, model: r.model, semantic: r.semantic, pgvector: await hasPgvector(), total: s.total, indexed: s.indexed };
}

module.exports = { insertChunks, recordUsage, hasPgvector, resetPgvectorCache, reindex, status };
