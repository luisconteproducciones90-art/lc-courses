'use strict';
// API pública v1 para el ecosistema LC (LC-SYSTEM BUSINESS, LC-ECOMMERCE, LC-PEDIDOS, LC-PREVIEWS) y sistemas externos.
// Autenticación: Authorization: Bearer lcb_sk_…  (clave con scopes, por empresa). Sin cookies → sin CSRF.
const express = require('express');
const db = require('../db/pool');
const rl = require('../middleware/rateLimit');
const { wrap } = require('../middleware/errors');
const { parse, z, str } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { sha256 } = require('../lib/tokens');
const { upsertProducts } = require('../services/catalog');
const domain = require('../services/domain');
const events = require('../services/events');

const router = express.Router();

async function apiAuth(req, res, next) {
  try {
    const m = /^Bearer (lcb_sk_[A-Za-z0-9_-]{20,80})$/.exec(req.get('authorization') || '');
    if (!m) throw E.unauthorized('API key requerida (Authorization: Bearer lcb_sk_…)');
    const [k] = await db.system((q) => q(`SELECT k.id, k.company_id, k.scopes, c.status FROM api_keys k JOIN companies c ON c.id = k.company_id WHERE k.key_hash = $1 AND k.revoked_at IS NULL`, [sha256(m[1])]));
    if (!k) throw E.unauthorized('API key inválida o revocada');
    if (k.status === 'suspended') throw E.forbidden('Empresa suspendida');
    req.apiKeyId = k.id; req.companyId = k.company_id; req.scopes = k.scopes;
    db.system((q) => q('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [k.id])).catch(() => {});
    next();
  } catch (e) { next(e); }
}
const need = (scope) => (req, res, next) => (req.scopes.includes(scope) ? next() : next(E.forbidden(`La clave no tiene el permiso ${scope}`)));
router.use(apiAuth, rl.api);

router.get('/products', need('products:read'), wrap(async (req, res) => {
  const f = parse(z.object({ q: str(100).optional(), limit: z.coerce.number().int().min(1).max(500).default(100), offset: z.coerce.number().int().min(0).default(0) }), req.query);
  const rows = await db.tenant(req.companyId, (q) => q(`SELECT sku, code, name, description, price, stock, stock_min, brand, supplier, status, updated_at FROM products WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR sku ILIKE '%' || $1 || '%') ORDER BY name LIMIT $2 OFFSET $3`, [f.q ? f.q.replace(/[%_\\]/g, '\\$&') : null, f.limit, f.offset]));
  res.json({ products: rows });
}));
router.get('/products/:sku/stock', need('stock:read'), wrap(async (req, res) => {
  const [p] = await db.tenant(req.companyId, (q) => q('SELECT sku, name, stock, stock_min, price FROM products WHERE sku = $1', [String(req.params.sku).slice(0, 80)]));
  if (!p) throw E.notFound('Producto no encontrado');
  res.json({ ...p, availability: domain.stockLabel(p) });
}));
const productRow = z.object({ sku: str(80, 1), name: str(200, 2), price: z.union([z.number(), z.string()]).optional(), stock: z.union([z.number(), z.string()]).optional(), stock_min: z.union([z.number(), z.string()]).optional(),
  brand: str(120).optional(), category: str(80).optional(), supplier: str(160).optional(), description: str(2000).optional(), code: str(80).optional() });
router.post('/products/sync', need('products:write'), wrap(async (req, res) => {
  const { products } = parse(z.object({ products: z.array(z.any()).min(1).max(2000) }), req.body);
  const valid = []; const errors = [];
  products.forEach((p, i) => { const r = productRow.safeParse(p); if (r.success) valid.push(r.data); else errors.push(`ítem ${i}: ${r.error.issues[0].path.join('.')} ${r.error.issues[0].message}`); });
  const result = await upsertProducts(req.companyId, valid, 'api');
  res.json({ ...result, errors: [...errors.slice(0, 20), ...result.errors] });
}));
router.patch('/products/:sku/stock', need('products:write'), wrap(async (req, res) => {
  const b = parse(z.object({ stock: z.number().int().min(-1e9).max(1e9) }), req.body);
  const out = await db.tenant(req.companyId, async (q) => {
    const [cur] = await q('SELECT id, stock, stock_min FROM products WHERE sku = $1', [req.params.sku]); if (!cur) throw E.notFound('Producto no encontrado');
    await q('UPDATE products SET stock = $2 WHERE id = $1', [cur.id, b.stock]); return cur;
  });
  if (out.stock_min > 0 && b.stock <= out.stock_min && out.stock > out.stock_min) await events.emit(req.companyId, 'stock.low', { productId: out.id });
  res.json({ ok: true, sku: req.params.sku, stock: b.stock });
}));
router.get('/customers', need('customers:read'), wrap(async (req, res) => {
  const rows = await db.tenant(req.companyId, (q) => q('SELECT id, first_name, last_name, company_name, phone, whatsapp, email, lead_status, last_purchase_at, external_ref FROM customers ORDER BY created_at DESC LIMIT 500'));
  res.json({ customers: rows });
}));
router.post('/customers/sync', need('customers:write'), wrap(async (req, res) => {
  const { customers } = parse(z.object({ customers: z.array(z.object({ name: str(120).optional(), phone: str(40).optional(), whatsapp: str(40).optional(), email: str(200).optional(), external_ref: str(100).optional(), last_purchase_at: z.string().datetime().optional() })).min(1).max(1000) }), req.body);
  let created = 0; let updated = 0;
  await db.tenant(req.companyId, async (q) => {
    for (const c of customers) {
      if (!c.phone && !c.whatsapp && !c.email) continue;
      const r = await domain.upsertCustomer(q, req.companyId, { ...c, source: 'api' });
      await q("UPDATE customers SET external_ref = COALESCE(NULLIF($2,''), external_ref), last_purchase_at = COALESCE($3::timestamptz, last_purchase_at) WHERE id = $1", [r.customer.id, c.external_ref || '', c.last_purchase_at || null]);
      if (r.created) created += 1; else updated += 1;
    }
  });
  res.json({ created, updated });
}));
router.get('/orders', need('orders:read'), wrap(async (req, res) => {
  const f = parse(z.object({ since: z.string().datetime().optional() }), req.query);
  res.json({ orders: await db.tenant(req.companyId, (q) => q('SELECT id, kind, status, items, total, notes, source, created_at FROM orders WHERE ($1::timestamptz IS NULL OR created_at > $1) ORDER BY created_at DESC LIMIT 500', [f.since || null])) });
}));
router.post('/orders', need('orders:write'), wrap(async (req, res) => {
  const b = parse(z.object({ kind: z.enum(['quote', 'order']), items: z.array(z.object({ sku: str(80, 1), qty: z.number().int().min(1).max(10000) })).min(1).max(50), notes: str(1000).default('') }), req.body);
  const o = await db.tenant(req.companyId, (q) => domain.createOrder(q, req.companyId, { ...b, source: 'api' }));
  await events.emit(req.companyId, 'order.created', { orderId: o.id });
  res.status(201).json({ order: o });
}));
router.get('/conversations', need('conversations:read'), wrap(async (req, res) => {
  const f = parse(z.object({ since: z.string().datetime().optional() }), req.query);
  res.json({ conversations: await db.tenant(req.companyId, (q) => q('SELECT id, channel, status, mode, contact_name, tags, last_message_at FROM conversations WHERE ($1::timestamptz IS NULL OR last_message_at > $1) ORDER BY last_message_at DESC LIMIT 500', [f.since || null])) });
}));
module.exports = router;
