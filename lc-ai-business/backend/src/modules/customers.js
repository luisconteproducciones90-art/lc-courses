'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { clean } = require('../lib/text');
const { E } = require('../lib/httpError');
const { audit } = require('../lib/audit');
const events = require('../services/events');

const router = express.Router();
router.use(authenticate);
const STATUSES = ['new', 'contacted', 'interested', 'quote', 'customer', 'lost'];
const body = z.object({
  first_name: str(80), last_name: str(80), company_name: str(160), phone: str(40), whatsapp: str(40),
  email: z.string().trim().max(200).refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Email inválido'), address: str(240),
  tags: z.array(z.string().trim().min(1).max(30)).max(15), lead_status: z.enum(STATUSES), notes: z.string().max(3000).transform((v) => clean(v, 3000)),
}).partial();
const COLS = ['first_name', 'last_name', 'company_name', 'phone', 'whatsapp', 'email', 'address', 'tags', 'lead_status', 'notes'];

router.get('/', requirePerm('crm:read'), wrap(async (req, res) => {
  const f = parse(z.object({ q: str(100).optional(), status: z.enum(STATUSES).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }), req.query);
  const out = await db.tenant(req.user.companyId, async (q) => ({
    customers: await q(`SELECT c.*, a.name AS agent_name FROM customers c LEFT JOIN agents a ON a.id = c.last_agent_id
      WHERE ($1::text IS NULL OR (c.first_name || ' ' || c.last_name || ' ' || c.company_name || ' ' || c.email || ' ' || c.phone || ' ' || c.whatsapp) ILIKE '%' || $1 || '%') AND ($2::text IS NULL OR c.lead_status = $2)
      ORDER BY COALESCE(c.last_contact_at, c.created_at) DESC LIMIT $3`, [f.q ? f.q.replace(/[%_\\]/g, '\\$&') : null, f.status || null, f.limit]),
    counts: Object.fromEntries((await q('SELECT lead_status, count(*)::int n FROM customers GROUP BY 1')).map((r) => [r.lead_status, r.n])),
  }));
  res.json(out);
}));

router.get('/:id', requirePerm('crm:read'), wrap(async (req, res) => {
  const cid = parse(id, req.params.id);
  const out = await db.tenant(req.user.companyId, async (q) => {
    const [customer] = await q('SELECT * FROM customers WHERE id = $1', [cid]);
    if (!customer) throw E.notFound('Cliente no encontrado');
    return { customer,
      conversations: await q('SELECT v.id, v.status, v.channel, v.last_message_at, a.name AS agent_name FROM conversations v JOIN agents a ON a.id = v.agent_id WHERE v.customer_id = $1 ORDER BY v.last_message_at DESC LIMIT 20', [cid]),
      leads: await q('SELECT id, interest, value, status, source, created_at FROM leads WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20', [cid]),
      orders: await q('SELECT id, kind, status, total, created_at FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20', [cid]) };
  });
  res.json(out);
}));

router.post('/', requirePerm('crm:write'), wrap(async (req, res) => {
  const b = parse(body, req.body);
  if (!b.first_name && !b.company_name && !b.email && !b.phone && !b.whatsapp) throw E.badRequest('Ingresá al menos un nombre o dato de contacto');
  const c = await db.tenant(req.user.companyId, async (q) => {
    const v = { first_name: '', last_name: '', company_name: '', phone: '', whatsapp: '', email: '', address: '', tags: [], lead_status: 'new', notes: '', ...b };
    const [r] = await q(`INSERT INTO customers (company_id, source, ${COLS.join(',')}) VALUES ($1,'manual',${COLS.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`, [req.user.companyId, ...COLS.map((k) => v[k])]);
    return r;
  });
  await audit(req, 'customer.create', 'customer', c.id);
  await events.emit(req.user.companyId, 'customer.created', { customerId: c.id });
  res.status(201).json({ customer: c });
}));

router.put('/:id', requirePerm('crm:write'), wrap(async (req, res) => {
  const cid = parse(id, req.params.id); const b = parse(body.extend({ last_purchase_at: z.string().datetime().nullable().optional() }), req.body);
  const keys = [...COLS.filter((k) => b[k] !== undefined), ...(b.last_purchase_at !== undefined ? ['last_purchase_at'] : [])];
  const c = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q('SELECT id FROM customers WHERE id = $1', [cid]);
    if (!cur) throw E.notFound('Cliente no encontrado');
    if (keys.length) await q(`UPDATE customers SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [cid, ...keys.map((k) => b[k])]);
    return (await q('SELECT * FROM customers WHERE id = $1', [cid]))[0];
  });
  await audit(req, 'customer.update', 'customer', cid, { fields: keys });
  res.json({ customer: c });
}));

router.delete('/:id', requirePerm('crm:write'), wrap(async (req, res) => {
  const cid = parse(id, req.params.id);
  const r = await db.tenant(req.user.companyId, (q) => q('DELETE FROM customers WHERE id = $1 RETURNING id', [cid]));
  if (!r.length) throw E.notFound('Cliente no encontrado');
  await audit(req, 'customer.delete', 'customer', cid);
  res.json({ ok: true });
}));

// Leads (oportunidades)
const leads = express.Router();
leads.use(authenticate);
leads.get('/', requirePerm('crm:read'), wrap(async (req, res) => {
  const rows = await db.tenant(req.user.companyId, (q) => q(`SELECT l.*, trim(c.first_name || ' ' || c.last_name) AS customer_name, a.name AS agent_name FROM leads l
    LEFT JOIN customers c ON c.id = l.customer_id LEFT JOIN agents a ON a.id = l.agent_id ORDER BY l.created_at DESC LIMIT 200`));
  res.json({ leads: rows });
}));
leads.put('/:id', requirePerm('crm:write'), wrap(async (req, res) => {
  const lid = parse(id, req.params.id); const b = parse(z.object({ status: z.enum(['open', 'won', 'lost']).optional(), value: z.number().min(0).max(1e12).optional() }), req.body);
  const l = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q('SELECT * FROM leads WHERE id = $1', [lid]); if (!cur) throw E.notFound('Lead no encontrado');
    const [r] = await q('UPDATE leads SET status = COALESCE($2,status), value = COALESCE($3,value) WHERE id = $1 RETURNING *', [lid, b.status ?? null, b.value ?? null]);
    if (b.status === 'won' && r.customer_id) await q("UPDATE customers SET lead_status = 'customer', last_purchase_at = now() WHERE id = $1", [r.customer_id]);
    if (b.status === 'lost' && r.customer_id) await q("UPDATE customers SET lead_status = 'lost' WHERE id = $1 AND lead_status <> 'customer'", [r.customer_id]);
    return r;
  });
  res.json({ lead: l });
}));

module.exports = { customers: router, leads };
