'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { audit } = require('../lib/audit');
const limits = require('../services/limits');
const billing = require('../services/billing');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePerm('billing:read'), wrap(async (req, res) => {
  const out = await db.tenant(req.user.companyId, async (q) => {
    const [company] = await q('SELECT c.status, p.id AS plan_id, p.code, p.name, p.limits, p.price_cents, p.currency FROM companies c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = $1', [req.user.companyId]);
    return {
      plan: company, usage: await limits.usageFor(q, req.user.companyId),
      subscription: (await q("SELECT status, provider, current_period_end FROM subscriptions WHERE status <> 'canceled' ORDER BY created_at DESC LIMIT 1"))[0] || null,
      invoices: await q('SELECT id, amount, currency, status, provider, description, period_end, paid_at, created_at FROM invoices ORDER BY created_at DESC LIMIT 24'),
    };
  });
  const plans = await db.system((q) => q('SELECT id, code, name, description, price_cents, currency, limits, features FROM plans WHERE is_active ORDER BY sort_order'));
  res.json({ ...out, plans, online_payments: billing.mpEnabled() });
}));

// Contratar / cambiar de plan por cobro online (Mercado Pago)
router.post('/checkout', requirePerm('billing:write'), wrap(async (req, res) => {
  const b = parse(z.object({ planCode: str(40, 1) }), req.body);
  const [plan] = await db.system((q) => q('SELECT * FROM plans WHERE code = $1 AND is_active', [b.planCode]));
  if (!plan) throw E.notFound('Plan inexistente');
  const out = await billing.startCheckout({ companyId: req.user.companyId, payerEmail: req.user.email, plan });
  await audit(req, 'billing.checkout', 'plan', b.planCode);
  res.json(out);
}));

// Pedido de cambio de plan (cuando no hay precio o cobro online): queda registrado para SUPER ADMIN
router.post('/request-change', requirePerm('billing:write'), wrap(async (req, res) => {
  const b = parse(z.object({ planCode: str(40, 1), message: str(500) }), req.body);
  const [plan] = await db.system((q) => q('SELECT code FROM plans WHERE code = $1 AND is_active', [b.planCode]));
  if (!plan) throw E.notFound('Plan inexistente');
  await audit(req, 'billing.plan_request', 'plan', b.planCode, { message: b.message });
  res.json({ ok: true });
}));

module.exports = router;
