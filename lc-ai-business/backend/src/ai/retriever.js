'use strict';
// Interfaz de recuperación de conocimiento. Hoy: full-text español (Postgres).
// Para búsqueda semántica: implementar la misma firma con pgvector/embeddings y cambiar `search`.
const TOKEN_RE = /[\p{L}\p{N}]{2,}/gu;

function toQuery(text) {
  const tokens = [...new Set((String(text).toLowerCase().match(TOKEN_RE) || []).slice(0, 24))];
  return tokens.join(' or ');
}

/** q: función de consulta con contexto de tenant (db.tenant). */
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
    [tsq, agentId, Math.min(limit, 10)]
  );
}

module.exports = { search, toQuery };
