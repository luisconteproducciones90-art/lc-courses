'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { audit } = require('../lib/audit');
const providers = require('../ai/providers');

const router = express.Router();
router.use(authenticate, requirePerm('admin:*'));

router.get('/stats', wrap(async (req, res) => {
  const [s] = await db.system((q) => q(`SELECT
    (SELECT count(*)::int FROM companies WHERE NOT is_demo) companies, (SELECT count(*)::int FROM companies WHERE status = 'suspended') suspended,
    (SELECT count(*)::int FROM users WHERE role <> 'super_admin') users, (SELECT count(*)::int FROM agents) agents,
    (SELECT count(*)::int FROM conversations) conversations, (SELECT count(*)::int FROM documents) documents,
    (SELECT COALESCE(sum(tokens_in + tokens_out),0)::int FROM usage) tokens`));
  res.json({ stats: s });
}));

router.get('/companies', wrap(async (req, res) => {
  const companies = await db.system((q) => q(`SELECT c.id, c.name, c.status, c.is_demo, c.created_at, p.code AS plan_code, p.name AS plan_name,
      (SELECT count(*)::int FROM users u WHERE u.company_id = c.id) users, (SELECT count(*)::int FROM agents a WHERE a.company_id = c.id) agents,
      (SELECT count(*)::int FROM conversations v WHERE v.company_id = c.id) conversations,
      (SELECT COALESCE(sum(tokens_in + tokens_out),0)::int FROM usage g WHERE g.company_id = c.id) tokens
    FROM companies c LEFT JOIN plans p ON p.id = c.plan_id ORDER BY c.created_at DESC`));
  res.json({ companies });
}));

router.post('/companies', wrap(async (req, res) => {
  const b = parse(z.object({
    name: str(120, 2), adminName: str(120, 2), adminEmail: z.string().trim().toLowerCase().email(),
    adminPassword: z.string().min(10).max(128).refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Debe incluir letras y números'), planCode: str(40).default('start'),
  }), req.body);
  const hash = await bcrypt.hash(b.adminPassword, 12);
  const c = await db.system(async (q) => {
    const [plan] = await q('SELECT id FROM plans WHERE code = $1', [b.planCode]);
    if (!plan) throw E.badRequest('Plan inexistente');
    const [co] = await q("INSERT INTO companies (name, plan_id, status) VALUES ($1,$2,'active') RETURNING id, name", [b.name, plan.id]);
    await q("INSERT INTO subscriptions (company_id, plan_id, status) VALUES ($1,$2,'active')", [co.id, plan.id]);
    await q("INSERT INTO users (company_id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,'company_admin')", [co.id, b.adminEmail, hash, b.adminName]);
    return co;
  }).catch((e) => { if (e.code === '23505') throw E.conflict('Ya existe un usuario con ese email'); throw e; });
  await audit(req, 'admin.company_create', 'company', c.id, {}, null);
  res.status(201).json({ company: c });
}));

router.patch('/companies/:id', wrap(async (req, res) => {
  const cid = parse(id, req.params.id);
  const b = parse(z.object({ status: z.enum(['trial', 'active', 'suspended']).optional(), planCode: str(40).optional() }), req.body);
  const c = await db.system(async (q) => {
    const [cur] = await q('SELECT * FROM companies WHERE id = $1', [cid]);
    if (!cur) throw E.notFound('Empresa no encontrada');
    if (cur.is_demo && b.status === 'suspended') throw E.badRequest('No se puede suspender la empresa demo');
    if (b.planCode) {
      const [plan] = await q('SELECT id FROM plans WHERE code = $1', [b.planCode]);
      if (!plan) throw E.badRequest('Plan inexistente');
      await q('UPDATE companies SET plan_id = $2 WHERE id = $1', [cid, plan.id]);
      await q("UPDATE subscriptions SET plan_id = $2 WHERE company_id = $1 AND status IN ('trialing','active')", [cid, plan.id]);
    }
    if (b.status) {
      await q('UPDATE companies SET status = $2 WHERE id = $1', [cid, b.status]);
      if (b.status === 'suspended') await q('UPDATE refresh_sessions SET revoked_at = now() WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE company_id = $1)', [cid]);
    }
    return (await q('SELECT id, name, status FROM companies WHERE id = $1', [cid]))[0];
  });
  await audit(req, 'admin.company_update', 'company', cid, b, null);
  res.json({ company: c });
}));

// ----- Planes (precios y límites configurables; sin precios definitivos) -----
router.get('/plans', wrap(async (req, res) => {
  res.json({ plans: await db.system((q) => q('SELECT * FROM plans ORDER BY sort_order, created_at')) });
}));
const limit = z.number().int().min(-1).max(100000000); // -1 = ilimitado
const planBody = z.object({
  name: str(80, 2), description: str(300), price_cents: z.number().int().min(0).nullable(), currency: str(3, 3), is_active: z.boolean(), sort_order: z.number().int(),
  limits: z.object({ users: limit, agents: limit, conversations: limit, documents: limit, storage_mb: limit, ai_tokens: limit }).partial(),
  features: z.record(z.string().max(40), z.boolean()),
});
router.put('/plans/:id', wrap(async (req, res) => {
  const pid = parse(id, req.params.id);
  const b = parse(planBody.partial(), req.body);
  const keys = Object.keys(b);
  const plan = await db.system(async (q) => {
    if (keys.length) await q(`UPDATE plans SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [pid, ...keys.map((k) => (k === 'limits' || k === 'features' ? JSON.stringify(b[k]) : b[k]))]);
    return (await q('SELECT * FROM plans WHERE id = $1', [pid]))[0];
  });
  if (!plan) throw E.notFound('Plan no encontrado');
  await audit(req, 'admin.plan_update', 'plan', pid, { fields: keys }, null);
  res.json({ plan });
}));

// ----- Proveedor de IA (nombre y modelo; las claves viven solo en variables de entorno) -----
router.get('/ai', wrap(async (req, res) => {
  const cur = await providers.resolve().catch(() => null);
  res.json({ active: cur && { provider: cur.provider.name, model: cur.model }, providers: providers.describe() });
}));
router.put('/ai', wrap(async (req, res) => {
  const b = parse(z.object({ provider: z.enum(['mock', 'anthropic', 'openai', 'google']), models: z.record(z.string(), str(80)).optional() }), req.body);
  await db.system((q) => q(`INSERT INTO settings (company_id, key, value) VALUES (NULL, 'ai_provider', $1)
    ON CONFLICT (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(b)]));
  await audit(req, 'admin.ai_provider', 'settings', 'ai_provider', b, null);
  res.json({ ok: true });
}));

router.get('/audit', wrap(async (req, res) => {
  const logs = await db.system((q) => q(`SELECT l.id, l.action, l.entity, l.entity_id, l.ip, l.created_at, l.company_id, c.name AS company_name, u.name AS user_name
    FROM audit_logs l LEFT JOIN companies c ON c.id = l.company_id LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 100`));
  res.json({ logs });
}));

module.exports = router;
