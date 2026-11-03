'use strict';
// Modo DEMO público: datos ficticios, sin autenticación, con límites estrictos.
const express = require('express');
const db = require('../db/pool');
const rl = require('../middleware/rateLimit');
const { wrap } = require('../middleware/errors');
const { parse, z, id } = require('../lib/validate');
const { clean } = require('../lib/text');
const { E } = require('../lib/httpError');
const orchestrator = require('../ai/orchestrator');

const router = express.Router();
let demoCompanyId = null;
async function demoCompany() {
  if (demoCompanyId) return demoCompanyId;
  const [c] = await db.system((q) => q('SELECT id FROM companies WHERE is_demo LIMIT 1'));
  if (!c) throw E.notFound('La demo no está disponible');
  demoCompanyId = c.id;
  return c.id;
}

router.get('/agents', wrap(async (req, res) => {
  const cid = await demoCompany();
  const [company] = await db.tenant(cid, (q) => q('SELECT name, description FROM companies WHERE id = $1', [cid]));
  const agents = await db.tenant(cid, (q) => q("SELECT id, name, type, avatar, description, welcome_message FROM agents WHERE status = 'active' ORDER BY created_at"));
  res.json({ company, agents });
}));

router.post('/chat', rl.demo, wrap(async (req, res) => {
  const b = parse(z.object({
    agentId: id, visitorId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/), conversationId: id.optional().nullable(),
    message: z.string().trim().min(1).max(400).transform((v) => clean(v, 400)),
  }), req.body);
  const cid = await demoCompany();
  const out = await orchestrator.handleCustomerMessage({
    companyId: cid, agentId: b.agentId, conversationId: b.conversationId || null, channel: 'demo', message: b.message,
    visitorId: b.visitorId, contactName: 'Visitante demo', requireActive: true, ignoreSchedule: true, maxMessages: 15, maxTokens: 350,
  });
  res.json({ conversationId: out.conversationId, reply: out.reply, status: out.status });
}));

module.exports = router;
