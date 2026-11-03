'use strict';
const express = require('express');
const rl = require('../middleware/rateLimit');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, id } = require('../lib/validate');
const { clean } = require('../lib/text');
const orchestrator = require('../ai/orchestrator');
const providers = require('../ai/providers');

const router = express.Router();
router.use(authenticate);

// Estado del proveedor SIN exponer claves.
router.get('/status', requirePerm('agents:read'), wrap(async (req, res) => {
  const { provider, model } = await providers.resolve();
  res.json({ provider: provider.name, model, simulated: provider.name === 'mock' });
}));

// Chat de prueba: la conversación queda registrada con canal "test".
router.post('/agents/:id/test', requirePerm('agents:write'), rl.chat, wrap(async (req, res) => {
  const agentId = parse(id, req.params.id);
  const b = parse(z.object({ message: z.string().trim().min(1).max(2000).transform((v) => clean(v, 2000)), conversationId: id.optional().nullable() }), req.body);
  const out = await orchestrator.handleCustomerMessage({
    companyId: req.user.companyId, agentId, conversationId: b.conversationId || null, channel: 'test', message: b.message,
    contactName: `Prueba · ${req.user.name}`, ignoreSchedule: true,
  });
  res.json(out);
}));

module.exports = router;
