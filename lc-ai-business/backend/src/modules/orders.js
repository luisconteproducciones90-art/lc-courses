'use strict';
// Presupuestos y pedidos + bandeja de aprobaciones de acciones de IA.
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { audit } = require('../lib/audit');
const domain = require('../services/domain');
const tools = require('../ai/tools');

const router = express.Router();
router.use(authenticate);
const itemsSchema = z.array(z.object({ sku: z.string().trim().max(80).optional(), name: z.string().trim().max(120).optional(), qty: z.number().int().min(1).max(10000).default(1) })).min(1).max(50);

router.get('/', requirePerm('crm:read'), wrap(async (req, res) => {
  const rows = await db.tenant(req.user.companyId, (q) => q(`SELECT o.*, trim(c.first_name || ' ' || c.last_name) AS customer_name FROM orders o LEFT JOIN customers c ON c.id = o.customer_id ORDER BY o.created_at DESC LIMIT 200`));
  res.json({ orders: rows });
}));
router.post('/', requirePerm('crm:write'), wrap(async (req, res) => {
  const b = parse(z.object({ kind: z.enum(['quote', 'order']), items: itemsSchema, customer_id: id.nullable().optional(), notes: str(1000).default('') }), req.body);
  const o = await db.tenant(req.user.companyId, (q) => domain.createOrder(q, req.user.companyId, { ...b, customerId: b.customer_id, source: 'manual' }));
  await audit(req, `${b.kind}.create`, 'order', o.id);
  res.status(201).json({ order: o });
}));
router.put('/:id', requirePerm('crm:write'), wrap(async (req, res) => {
  const oid = parse(id, req.params.id); const b = parse(z.object({ status: z.enum(['pending', 'confirmed', 'delivered', 'cancelled']) }), req.body);
  const o = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [oid]); if (!cur) throw E.notFound('No encontrado');
    if (cur.kind === 'order' && b.status === 'confirmed' && cur.status === 'pending') {
      for (const it of cur.items) { // descuenta stock al confirmar, nunca por debajo de 0
        const r = await q('UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING id', [it.product_id, it.qty]);
        if (!r.length) throw E.conflict(`Stock insuficiente de ${it.name}`);
      }
      if (cur.customer_id) await q("UPDATE customers SET last_purchase_at = now(), lead_status = 'customer' WHERE id = $1", [cur.customer_id]);
    }
    return (await q('UPDATE orders SET status = $2 WHERE id = $1 RETURNING *', [oid, b.status]))[0];
  });
  await audit(req, 'order.status', 'order', oid, b);
  res.json({ order: o });
}));

// Aprobaciones de acciones de IA
const approvals = express.Router();
approvals.use(authenticate);
approvals.get('/', requirePerm('approvals:decide'), wrap(async (req, res) => {
  const rows = await db.tenant(req.user.companyId, (q) => q(`SELECT p.*, a.name AS agent_name FROM pending_actions p LEFT JOIN agents a ON a.id = p.agent_id ORDER BY (p.status = 'pending') DESC, p.created_at DESC LIMIT 100`));
  res.json({ approvals: rows.map((r) => ({ ...r, tool_label: tools.CATALOG[r.tool]?.label || r.tool })) });
}));
approvals.post('/:id/:decision(approve|reject)', requirePerm('approvals:decide'), wrap(async (req, res) => {
  const pid = parse(id, req.params.id); const approve = req.params.decision === 'approve';
  const pa = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q("SELECT * FROM pending_actions WHERE id = $1 AND status = 'pending' FOR UPDATE", [pid]);
    if (!cur) throw E.notFound('Acción no encontrada o ya resuelta');
    await q('UPDATE pending_actions SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1', [pid, approve ? 'approved' : 'rejected', req.user.id]);
    return cur;
  });
  let result = {};
  if (approve) {
    const { _channel, _contact, ...input } = pa.input;
    try { result = await tools.performEffect(pa.tool, { companyId: req.user.companyId, agentId: pa.agent_id, conversationId: pa.conversation_id, channel: _channel, contact: _contact }, input); }
    catch (e) { result = { error: e.message }; }
    await db.tenant(req.user.companyId, (q) => q('UPDATE pending_actions SET result = $2 WHERE id = $1', [pid, JSON.stringify(result)]));
  }
  await audit(req, `approval.${req.params.decision}`, 'pending_action', pid, { tool: pa.tool });
  res.json({ ok: !result.error, result });
}));

module.exports = { orders: router, approvals };
