'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { assertLimit } = require('../lib/plans');
const { audit } = require('../lib/audit');
const { chunkText } = require('../ai/chunker');
const tools = require('../ai/tools');
const limits = require('../services/limits');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePerm('agents:read'), wrap(async (req, res) => {
  const templates = await db.system((q) => q("SELECT id, slug, name, industry, description, icon, config->'agent'->>'type' AS type, jsonb_array_length(COALESCE(config->'knowledge','[]'::jsonb)) AS docs, config->'tools' AS tools, installs FROM agent_templates WHERE status = 'published' ORDER BY name"));
  const installed = await db.tenant(req.user.companyId, (q) => q('SELECT template_id, count(*)::int n FROM agent_installs GROUP BY 1'));
  const map = Object.fromEntries(installed.map((i) => [i.template_id, i.n]));
  res.json({ templates: templates.map((t) => ({ ...t, installed: map[t.id] || 0 })) });
}));

// Instala: crea el agente (borrador) + conocimiento inicial. Respeta los límites del plan.
router.post('/:slug/install', requirePerm('agents:write'), wrap(async (req, res) => {
  const slug = parse(str(80, 1), req.params.slug);
  const [t] = await db.system((q) => q("SELECT * FROM agent_templates WHERE slug = $1 AND status = 'published'", [slug]));
  if (!t) throw E.notFound('Plantilla no disponible');
  const cfg = t.config; const a = cfg.agent || {};
  const out = await db.tenant(req.user.companyId, async (q) => {
    await assertLimit(q, req.user.companyId, 'agents');
    const names = (cfg.tools || []).filter((n) => tools.CATALOG[n]);
    const [ag] = await q(`INSERT INTO agents (company_id, created_by, name, description, type, avatar, personality, tone, language, objective, instructions, welcome_message, offline_message, rules, autonomy, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'es',$9,$10,$11,$12,$13,$14,'draft') RETURNING id, name`,
    [req.user.companyId, req.user.id, a.name || t.name, a.description || t.description, a.type || 'custom', a.avatar || t.icon, a.personality || '', a.tone || 'profesional', a.objective || '', a.instructions || '', a.welcome_message || '', a.offline_message || '', JSON.stringify(a.rules || []), a.autonomy || 'medium']);
    for (const n of names) await q('INSERT INTO agent_tools (company_id, agent_id, tool_name, requires_approval) VALUES ($1,$2,$3,$4)', [req.user.companyId, ag.id, n, tools.CATALOG[n].effect ? (cfg.approvals ? cfg.approvals.includes(n) : tools.defaultApproval(n)) : false]);
    let docs = 0;
    for (const k of cfg.knowledge || []) {
      await assertLimit(q, req.user.companyId, 'documents');
      await limits.checkStorage(q, req.user.companyId, Buffer.byteLength(k.content));
      const chunks = chunkText(k.content);
      const [d] = await q("INSERT INTO documents (company_id, agent_id, title, source_type, mime, size_bytes, status, chunk_count, created_by) VALUES ($1,$2,$3,'text','text/plain',$4,'ready',$5,$6) RETURNING id",
        [req.user.companyId, ag.id, `${k.title} (plantilla)`, Buffer.byteLength(k.content), chunks.length, req.user.id]);
      for (let i = 0; i < chunks.length; i += 1) await q('INSERT INTO knowledge_chunks (company_id, document_id, ordinal, content) VALUES ($1,$2,$3,$4)', [req.user.companyId, d.id, i, chunks[i]]);
      docs += 1;
    }
    await q('INSERT INTO agent_installs (company_id, template_id, agent_id) VALUES ($1,$2,$3)', [req.user.companyId, t.id, ag.id]);
    return { agent: ag, documents: docs };
  });
  await db.system((q) => q('UPDATE agent_templates SET installs = installs + 1 WHERE id = $1', [t.id]));
  await audit(req, 'marketplace.install', 'agent_template', slug);
  res.status(201).json({ ...out, next_steps: ['Completá los datos marcados con [COMPLETAR] en los documentos de la plantilla', 'Cargá tus productos (Productos → Importar CSV) o conectá tu sistema', 'Probá el agente y activalo', 'Activá WhatsApp o instalá el widget'] });
}));

module.exports = router;
