'use strict';
const express = require('express');
const multer = require('multer');
const db = require('../db/pool');
const rl = require('../middleware/rateLimit');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { clean } = require('../lib/text');
const { E } = require('../lib/httpError');
const { assertLimit } = require('../lib/plans');
const { audit } = require('../lib/audit');
const { chunkText, chunkCsv } = require('../ai/chunker');
const { extract, fromUrl, SUPPORTED } = require('../ai/extractors');
const retriever = require('../ai/retriever');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const docs = express.Router();
const knowledge = express.Router();
docs.use(authenticate); knowledge.use(authenticate);

async function ingest(req, { title, sourceType, filename, mime, size, text, csv, parts, agentId }) {
  const chunks = parts ? parts.flatMap((p) => (p.csv ? chunkCsv(p.text).map((c) => `${p.label}\n${c}`) : chunkText(p.text))) : csv ? chunkCsv(text) : chunkText(text);
  if (!chunks.length) throw E.badRequest('El documento no tiene contenido utilizable');
  return db.tenant(req.user.companyId, async (q) => {
    await assertLimit(q, req.user.companyId, 'documents');
    await require('../services/limits').checkStorage(q, req.user.companyId, size || 0);
    if (agentId) { const [a] = await q('SELECT id FROM agents WHERE id = $1', [agentId]); if (!a) throw E.notFound('Agente no encontrado'); }
    const [d] = await q(
      `INSERT INTO documents (company_id, agent_id, title, source_type, filename, mime, size_bytes, status, chunk_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ready',$8,$9) RETURNING *`,
      [req.user.companyId, agentId || null, title, sourceType, filename, mime, size, chunks.length, req.user.id]);
    for (let i = 0; i < chunks.length; i += 1) {
      await q('INSERT INTO knowledge_chunks (company_id, document_id, ordinal, content) VALUES ($1,$2,$3,$4)', [req.user.companyId, d.id, i, chunks[i]]);
    }
    return d;
  });
}

docs.get('/', requirePerm('knowledge:read'), wrap(async (req, res) => {
  const documents = await db.tenant(req.user.companyId, (q) => q(
    `SELECT d.id, d.title, d.source_type, d.filename, d.mime, d.size_bytes, d.status, d.error, d.chunk_count, d.agent_id, d.created_at, a.name AS agent_name
       FROM documents d LEFT JOIN agents a ON a.id = d.agent_id ORDER BY d.created_at DESC`));
  res.json({ documents, supported: SUPPORTED });
}));

docs.post('/upload', requirePerm('knowledge:write'), rl.upload, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw E.badRequest('Falta el archivo (campo "file")');
  const b = parse(z.object({ title: str(160).optional(), agentId: id.optional().or(z.literal('')) }), req.body);
  const filename = clean(Buffer.from(req.file.originalname, 'latin1').toString('utf8'), 200) || 'documento';
  const ex = await extract(filename, req.file.buffer);
  const doc = await ingest(req, { title: b.title || filename, sourceType: 'file', filename, mime: req.file.mimetype.slice(0, 100), size: req.file.size, text: ex.text, csv: ex.csv, parts: ex.parts, agentId: b.agentId || null });
  await audit(req, 'document.upload', 'document', doc.id, { filename });
  res.status(201).json({ document: doc });
}));

docs.post('/text', requirePerm('knowledge:write'), rl.upload, wrap(async (req, res) => {
  const b = parse(z.object({ title: str(160, 2), content: z.string().trim().min(10).max(200000), agentId: id.optional().nullable() }), req.body);
  const text = clean(b.content, 200000);
  const doc = await ingest(req, { title: b.title, sourceType: 'text', filename: '', mime: 'text/plain', size: Buffer.byteLength(text), text, agentId: b.agentId || null });
  await audit(req, 'document.create_text', 'document', doc.id);
  res.status(201).json({ document: doc });
}));

docs.post('/url', requirePerm('knowledge:write'), rl.upload, wrap(async (req, res) => {
  const b = parse(z.object({ url: z.string().trim().url().max(500), title: str(160).optional(), agentId: id.optional().nullable() }), req.body);
  const page = await fromUrl(b.url);
  const doc = await ingest(req, { title: b.title || new URL(page.finalUrl).hostname, sourceType: 'url', filename: page.finalUrl.slice(0, 200), mime: 'text/html', size: Buffer.byteLength(page.text), text: page.text, agentId: b.agentId || null });
  await audit(req, 'document.create_url', 'document', doc.id);
  res.status(201).json({ document: doc });
}));

docs.delete('/:id', requirePerm('knowledge:write'), wrap(async (req, res) => {
  const did = parse(id, req.params.id);
  const r = await db.tenant(req.user.companyId, (q) => q('DELETE FROM documents WHERE id = $1 RETURNING id', [did]));
  if (!r.length) throw E.notFound('Documento no encontrado');
  await audit(req, 'document.delete', 'document', did);
  res.json({ ok: true });
}));

// Prueba de recuperación: "qué fragmentos encontraría el agente"
knowledge.get('/search', requirePerm('knowledge:read'), wrap(async (req, res) => {
  const f = parse(z.object({ q: str(200, 2), agentId: id.optional() }), req.query);
  const results = await db.tenant(req.user.companyId, (q) => retriever.search(q, { query: f.q, agentId: f.agentId || null, limit: 6 }));
  res.json({ results: results.map((r) => ({ id: r.id, title: r.title, content: r.content, score: Number(r.rank) })) });
}));

module.exports = { docs, knowledge };
