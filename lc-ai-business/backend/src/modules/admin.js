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
const budget = z.number().min(-1).max(100000000); // presupuesto mensual de IA en la moneda de precios (-1 = sin tope)
const planBody = z.object({
  name: str(80, 2), description: str(300), price_cents: z.number().int().min(0).nullable(), currency: str(3, 3), is_active: z.boolean(), sort_order: z.number().int(),
  limits: z.object({ users: limit, agents: limit, conversations: limit, documents: limit, storage_mb: limit, ai_tokens: limit, ai_budget: budget }).partial(),
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

// ----- Facturas manuales (transferencia) -----
router.get('/invoices', wrap(async (req, res) => {
  res.json({ invoices: await db.system((q) => q('SELECT i.*, c.name AS company_name, p.name AS plan_name FROM invoices i JOIN companies c ON c.id = i.company_id LEFT JOIN plans p ON p.id = i.plan_id ORDER BY i.created_at DESC LIMIT 100')) });
}));
router.post('/companies/:id/invoices', wrap(async (req, res) => {
  const cid = parse(id, req.params.id);
  const b = parse(z.object({ planCode: str(40, 1), amount: z.number().min(0).max(1e9), description: str(200), months: z.number().int().min(1).max(24).default(1), activate: z.boolean().default(true) }), req.body);
  const inv = await db.system(async (q) => {
    const [plan] = await q('SELECT * FROM plans WHERE code = $1', [b.planCode]); if (!plan) throw E.badRequest('Plan inexistente');
    const [c] = await q('SELECT id FROM companies WHERE id = $1', [cid]); if (!c) throw E.notFound('Empresa no encontrada');
    const end = new Date(); end.setUTCMonth(end.getUTCMonth() + b.months);
    const [i] = await q("INSERT INTO invoices (company_id, plan_id, amount, currency, status, provider, description, period_start, period_end, paid_at) VALUES ($1,$2,$3,$4,'paid','manual',$5, now(), $6, now()) RETURNING *",
      [cid, plan.id, b.amount, plan.currency, b.description || `Plan ${plan.name} (pago manual)`, end]);
    if (b.activate) {
      await q("UPDATE companies SET plan_id = $2, status = CASE WHEN status = 'suspended' THEN status ELSE 'active' END WHERE id = $1", [cid, plan.id]);
      await q("UPDATE subscriptions SET status = 'canceled' WHERE company_id = $1 AND status IN ('trialing','active','past_due')", [cid]);
      await q("INSERT INTO subscriptions (company_id, plan_id, status, current_period_end, provider) VALUES ($1,$2,'active',$3,'manual')", [cid, plan.id, end]);
    }
    return i;
  });
  await audit(req, 'admin.invoice_create', 'invoice', inv.id, { plan: b.planCode, amount: b.amount }, null);
  res.status(201).json({ invoice: inv });
}));

// ----- Marketplace: plantillas de agentes -----
const tplSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/), name: str(120, 2), industry: str(80), description: str(400), icon: str(8), status: z.enum(['draft', 'published']),
  config: z.object({
    agent: z.object({ name: str(80), description: str(300), type: z.enum(['attention', 'sales', 'stock', 'admin', 'appointments', 'whatsapp', 'manager', 'custom']), avatar: str(8), personality: str(600), tone: str(80), objective: str(600), instructions: str(4000), welcome_message: str(500), offline_message: str(500), rules: z.array(str(300)).max(20), autonomy: z.enum(['low', 'medium', 'high']) }).partial().optional(),
    tools: z.array(str(60)).max(20), approvals: z.array(str(60)).max(20).optional(), knowledge: z.array(z.object({ title: str(160, 2), content: str(20000, 10) })).max(10),
  }),
});
router.get('/templates', wrap(async (req, res) => { res.json({ templates: await db.system((q) => q('SELECT * FROM agent_templates ORDER BY created_at DESC')) }); }));
router.post('/templates', wrap(async (req, res) => {
  const b = parse(tplSchema.partial({ industry: true, description: true, icon: true, status: true }), req.body);
  const [t] = await db.system((q) => q('INSERT INTO agent_templates (slug, name, industry, description, icon, config, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [b.slug, b.name, b.industry || '', b.description || '', b.icon || '🤖', JSON.stringify(b.config), b.status || 'draft']))
    .catch((e) => { if (e.code === '23505') throw E.conflict('Ya existe una plantilla con ese identificador'); throw e; });
  await audit(req, 'admin.template_create', 'agent_template', t.id, {}, null);
  res.status(201).json({ template: t });
}));
router.put('/templates/:id', wrap(async (req, res) => {
  const tid = parse(id, req.params.id); const b = parse(tplSchema.partial(), req.body);
  const [t] = await db.system((q) => q('UPDATE agent_templates SET name = COALESCE($2,name), industry = COALESCE($3,industry), description = COALESCE($4,description), icon = COALESCE($5,icon), config = COALESCE($6,config), status = COALESCE($7,status) WHERE id = $1 RETURNING *',
    [tid, b.name ?? null, b.industry ?? null, b.description ?? null, b.icon ?? null, b.config ? JSON.stringify(b.config) : null, b.status ?? null]));
  if (!t) throw E.notFound('Plantilla no encontrada');
  await audit(req, 'admin.template_update', 'agent_template', tid, { status: b.status }, null);
  res.json({ template: t });
}));

// ----- Embeddings (búsqueda semántica) -----
router.get('/embeddings', wrap(async (req, res) => {
  const r = await require('../ai/embeddings').resolve();
  res.json({ active: { provider: r.name, model: r.model, semantic: r.semantic }, providers: [{ name: 'local', semantic: false, configured: true, note: 'Offline: tolera tipeos, plurales y acentos; no entiende sinónimos' }, { name: 'openai', semantic: true, configured: require('../config/env').ai.openai.key !== '', note: 'Semántica real (text-embedding-3-small)' }], pgvector: await require('../services/knowledgeIndex').hasPgvector() });
}));
router.put('/embeddings', wrap(async (req, res) => {
  const b = parse(z.object({ provider: z.enum(['local', 'openai']) }), req.body);
  await db.system((q) => q(`INSERT INTO settings (company_id, key, value) VALUES (NULL, 'embeddings', $1)
    ON CONFLICT (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(b)]));
  await audit(req, 'admin.embeddings', 'settings', 'embeddings', b, null);
  res.json({ ok: true, note: 'Cada empresa debe reindexar su conocimiento (Conocimiento → Actualizar índice) para usar el nuevo modelo.' });
}));

// ----- Precios de IA (USD por millón de tokens, por modelo) para estimar el gasto -----
router.get('/pricing', wrap(async (req, res) => { res.json({ pricing: await require('../lib/pricing').get() }); }));
router.put('/pricing', wrap(async (req, res) => {
  const b = parse(z.object({ currency: str(3, 3).default('USD'), models: z.record(str(80, 1), z.object({ in: z.number().min(0).max(100000), out: z.number().min(0).max(100000) })) }), req.body);
  await db.system((q) => q(`INSERT INTO settings (company_id, key, value) VALUES (NULL, 'ai_pricing', $1)
    ON CONFLICT (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(b)]));
  require('../lib/pricing').invalidate();
  await audit(req, 'admin.pricing', 'settings', 'ai_pricing', { models: Object.keys(b.models) }, null);
  res.json({ ok: true });
}));

router.get('/jobs', wrap(async (req, res) => { res.json(await require('../services/queue').stats()); }));

router.get('/audit', wrap(async (req, res) => {
  const logs = await db.system((q) => q(`SELECT l.id, l.action, l.entity, l.entity_id, l.ip, l.created_at, l.company_id, c.name AS company_name, u.name AS user_name
    FROM audit_logs l LEFT JOIN companies c ON c.id = l.company_id LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 100`));
  res.json({ logs });
}));

module.exports = router;
