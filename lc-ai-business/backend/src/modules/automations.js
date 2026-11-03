'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { audit } = require('../lib/audit');
const { TRIGGERS, ACTIONS } = require('../services/automations');

const router = express.Router();
router.use(authenticate);
const action = z.object({ type: z.enum(Object.keys(ACTIONS)), title: str(160).optional(), body: str(500).optional(), text: str(1000).optional(), interest: str(500).optional(), description: str(1000).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(), reason: str(300).optional(), tag: str(30).optional(), status: z.enum(['new', 'contacted', 'interested', 'quote', 'customer', 'lost']).optional(), level: z.enum(['info', 'warning', 'alert']).optional() });
const schema = z.object({
  name: str(120, 2), enabled: z.boolean(), trigger: z.enum(Object.keys(TRIGGERS)),
  conditions: z.object({ keywords: z.array(str(60, 1)).max(20).optional(), days: z.number().int().min(1).max(3650).optional() }),
  actions: z.array(action).min(1).max(8),
});

router.get('/meta', requirePerm('automations:read'), (req, res) => res.json({ triggers: TRIGGERS, actions: ACTIONS }));
router.get('/', requirePerm('automations:read'), wrap(async (req, res) => {
  const out = await db.tenant(req.user.companyId, async (q) => ({
    automations: await q('SELECT * FROM automations ORDER BY created_at DESC'),
    logs: await q('SELECT l.id, l.event, l.status, l.detail, l.created_at, a.name AS automation_name FROM automation_logs l LEFT JOIN automations a ON a.id = l.automation_id ORDER BY l.created_at DESC LIMIT 30'),
  }));
  res.json(out);
}));
router.post('/', requirePerm('automations:write'), wrap(async (req, res) => {
  const b = parse(schema.partial({ enabled: true, conditions: true }), req.body);
  const [a] = await db.tenant(req.user.companyId, (q) => q('INSERT INTO automations (company_id, name, enabled, trigger, conditions, actions) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.user.companyId, b.name, b.enabled ?? true, b.trigger, JSON.stringify(b.conditions || {}), JSON.stringify(b.actions)]));
  await audit(req, 'automation.create', 'automation', a.id);
  res.status(201).json({ automation: a });
}));
router.put('/:id', requirePerm('automations:write'), wrap(async (req, res) => {
  const aid = parse(id, req.params.id); const b = parse(schema.partial(), req.body);
  const a = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q('SELECT id FROM automations WHERE id = $1', [aid]); if (!cur) throw E.notFound('Automatización no encontrada');
    return (await q('UPDATE automations SET name = COALESCE($2,name), enabled = COALESCE($3,enabled), trigger = COALESCE($4,trigger), conditions = COALESCE($5,conditions), actions = COALESCE($6,actions) WHERE id = $1 RETURNING *',
      [aid, b.name ?? null, b.enabled ?? null, b.trigger ?? null, b.conditions ? JSON.stringify(b.conditions) : null, b.actions ? JSON.stringify(b.actions) : null]))[0];
  });
  await audit(req, 'automation.update', 'automation', aid);
  res.json({ automation: a });
}));
router.delete('/:id', requirePerm('automations:write'), wrap(async (req, res) => {
  const aid = parse(id, req.params.id);
  const r = await db.tenant(req.user.companyId, (q) => q('DELETE FROM automations WHERE id = $1 RETURNING id', [aid]));
  if (!r.length) throw E.notFound('Automatización no encontrada');
  res.json({ ok: true });
}));
module.exports = router;
