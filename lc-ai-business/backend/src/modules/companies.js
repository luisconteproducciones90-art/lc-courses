'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str } = require('../lib/validate');
const { clean } = require('../lib/text');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(authenticate);

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hex inválido');
const url = z.string().trim().max(300).refine((v) => v === '' || /^https?:\/\//i.test(v), 'Debe comenzar con http(s)://');
const longText = (n) => z.string().max(n).transform((v) => clean(v, n));
const schema = z.object({
  name: str(120, 2), legal_name: str(160), tax_id: str(30), address: str(240), phone: str(40), whatsapp: str(40),
  email: z.string().trim().max(200).refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Email inválido'),
  website: url, instagram: str(120), facebook: str(200), business_hours: longText(600), timezone: str(60, 3),
  logo_url: url, brand_primary: color, brand_secondary: color,
  description: longText(1500), services: longText(2500), products_info: longText(2500), faq: longText(4000),
  policies: longText(3000), commercial_info: longText(2500),
}).partial();
const FIELDS = Object.keys(schema.shape);

router.get('/current', requirePerm('company:read'), wrap(async (req, res) => {
  const [c] = await db.tenant(req.user.companyId, (q) => q(
    `SELECT c.*, p.name AS plan_name, p.code AS plan_code, p.limits AS plan_limits FROM companies c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = $1`, [req.user.companyId]));
  res.json({ company: c });
}));

router.put('/current', requirePerm('company:update'), wrap(async (req, res) => {
  const b = parse(schema, req.body);
  const keys = FIELDS.filter((k) => b[k] !== undefined);
  if (keys.length) {
    // Los nombres de columna salen de una lista fija (FIELDS), nunca del input.
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await db.tenant(req.user.companyId, (q) => q(`UPDATE companies SET ${sets} WHERE id = $1`, [req.user.companyId, ...keys.map((k) => b[k])]));
  }
  await audit(req, 'company.update', 'company', req.user.companyId, { fields: keys });
  const [c] = await db.tenant(req.user.companyId, (q) => q('SELECT * FROM companies WHERE id = $1', [req.user.companyId]));
  res.json({ company: c });
}));

module.exports = router;
