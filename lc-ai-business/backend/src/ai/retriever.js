'use strict';
// Recuperación de conocimiento HÍBRIDA: palabras (full-text español) + vectores (embeddings), fusionadas con
// Reciprocal Rank Fusion. Si los embeddings no están disponibles, degrada a solo palabras sin romper nada.
const db = require('../db/pool');
const embeddings = require('./embeddings');
const knowledgeIndex = require('../services/knowledgeIndex');

const TOKEN_RE = /[\p{L}\p{N}]{2,}/gu;
const toQuery = (text) => [...new Set((String(text).toLowerCase().match(TOKEN_RE) || []).slice(0, 24))].join(' or ');
const RRF_K = 60;
const NODE_CAP = 4000; // sin pgvector: máximo de fragmentos comparados en la aplicación

/** Solo palabras. q: consulta con contexto de tenant. */
async function search(q, { query, agentId = null, limit = 5 }) {
  const tsq = toQuery(query);
  if (!tsq) return [];
  return q(
    `SELECT k.id, k.content, d.title, d.id AS document_id, ts_rank(k.tsv, w.query) AS rank
       FROM knowledge_chunks k
       JOIN documents d ON d.id = k.document_id AND d.status = 'ready'
       CROSS JOIN (SELECT websearch_to_tsquery('spanish'::regconfig, $1) AS query) w
      WHERE k.tsv @@ w.query AND (d.agent_id IS NULL OR d.agent_id = $2)
      ORDER BY rank DESC, k.ordinal ASC LIMIT $3`,
    [tsq, agentId, Math.min(limit, 10)]);
}

const cosine = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]; return s; };

/** Solo vectores: pgvector si existe, si no cosine en Node. Devuelve [{id, content, title, document_id, sim}]. */
async function vectorSearch(q, { vector, model, minSim, agentId, limit }) {
  if (await knowledgeIndex.hasPgvector()) {
    const lit = `[${vector.join(',')}]`;
    return q(
      `WITH c AS MATERIALIZED (
         SELECT k.id, k.content, d.title, d.id AS document_id, k.embedding FROM knowledge_chunks k JOIN documents d ON d.id = k.document_id AND d.status = 'ready'
          WHERE k.embedding_model = $1 AND k.embedding IS NOT NULL AND (d.agent_id IS NULL OR d.agent_id = $2))
       SELECT id, content, title, document_id, 1 - (embedding::vector <=> $3::vector) AS sim FROM c
        WHERE 1 - (embedding::vector <=> $3::vector) >= $4 ORDER BY embedding::vector <=> $3::vector LIMIT $5`,
      [model, agentId, lit, minSim, limit]);
  }
  const rows = await q(
    `SELECT k.id, k.content, d.title, d.id AS document_id, k.embedding FROM knowledge_chunks k JOIN documents d ON d.id = k.document_id AND d.status = 'ready'
      WHERE k.embedding_model = $1 AND k.embedding IS NOT NULL AND (d.agent_id IS NULL OR d.agent_id = $2) ORDER BY k.created_at DESC LIMIT $3`, [model, agentId, NODE_CAP]);
  return rows.map((r) => ({ id: r.id, content: r.content, title: r.title, document_id: r.document_id, sim: cosine(vector, r.embedding) }))
    .filter((r) => r.sim >= minSim).sort((a, b) => b.sim - a.sim).slice(0, limit);
}

/** Búsqueda híbrida. Devuelve {results:[{id,content,title,score,via:[...]}], mode:'hybrid'|'keyword'}. */
async function hybrid(companyId, { query, agentId = null, limit = 5 }) {
  const emb = await embeddings.embedQuery(query);
  return db.tenant(companyId, async (q) => {
    const fts = await search(q, { query, agentId, limit: 10 });
    const vec = emb.vector ? await vectorSearch(q, { vector: emb.vector, model: emb.model, minSim: emb.minSim, agentId, limit: 10 }) : [];
    const merged = new Map();
    const add = (list, tag) => list.forEach((r, i) => {
      const m = merged.get(r.id) || { id: r.id, content: r.content, title: r.title, document_id: r.document_id, score: 0, via: [] };
      m.score += 1 / (RRF_K + i + 1); m.via.push(tag); merged.set(r.id, m);
    });
    add(fts, 'palabras'); add(vec, emb.semantic ? 'semántica' : 'similitud'); // 'similitud' = hashing local (sin sinónimos)
    const results = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, Math.min(limit, 10));
    return { results, mode: emb.vector ? 'hybrid' : 'keyword', model: emb.model };
  });
}

module.exports = { search, hybrid, vectorSearch, toQuery };
