'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { clean } = require('../lib/text');
const { E } = require('../lib/httpError');
const domain = require('../services/domain');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePerm('crm:read'), wrap(async (req, res) => {
  const f = parse(z.object({ status: z.enum(['open', 'in_progress', 'closed']).optional() }), req.query);
  const tickets = await db.tenant(req.user.companyId, (q) => q(`SELECT t.*, trim(c.first_name || ' ' || c.last_name) AS customer_name, u.name AS assigned_name FROM tickets t
    LEFT JOIN customers c ON c.id = t.customer_id LEFT JOIN users u ON u.id = t.assigned_user_id WHERE ($1::text IS NULL OR t.status = $1) ORDER BY (t.status = 'closed'), t.created_at DESC LIMIT 200`, [f.status || null]));
  res.json({ tickets });
}));
router.post('/', requirePerm('crm:write'), wrap(async (req, res) => {
  const b = parse(z.object({ title: str(160, 3), description: str(2000).default(''), priority: z.enum(['low', 'normal', 'high']).default('normal'), customer_id: id.nullable().optional() }), req.body);
  const t = await db.tenant(req.user.companyId, (q) => domain.createTicket(q, req.user.companyId, { ...b, customerId: b.customer_id, source: 'manual' }));
  res.status(201).json({ ticket: t });
}));
router.put('/:id', requirePerm('crm:write'), wrap(async (req, res) => {
  const tid = parse(id, req.params.id);
  const b = parse(z.object({ status: z.enum(['open', 'in_progress', 'closed']).optional(), priority: z.enum(['low', 'normal', 'high']).optional(), assigned_user_id: id.nullable().optional(), title: str(160, 3).optional() }), req.body);
  const t = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q('SELECT id FROM tickets WHERE id = $1', [tid]); if (!cur) throw E.notFound('Ticket no encontrado');
    const [r] = await q('UPDATE tickets SET status = COALESCE($2,status), priority = COALESCE($3,priority), title = COALESCE($4,title), assigned_user_id = CASE WHEN $5 THEN $6 ELSE assigned_user_id END WHERE id = $1 RETURNING *',
      [tid, b.status ?? null, b.priority ?? null, b.title ? clean(b.title, 160) : null, b.assigned_user_id !== undefined, b.assigned_user_id ?? null]);
    return r;
  });
  res.json({ ticket: t });
}));
module.exports = router;
