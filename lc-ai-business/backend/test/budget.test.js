'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, Client, db } = require('./helpers');

let server; let base; let K; let root; let cid; let agent;
const addUsage = (model, tin, tout) => db.system((q) => q('INSERT INTO usage (company_id, provider, model, tokens_in, tokens_out) VALUES ($1,$2,$3,$4,$5)', [cid, 'test', model, tin, tout]));
const setBudget = async (v) => { const p = (await root.get('/api/admin/plans')).body.plans.find((x) => x.code === 'enterprise'); await root.put(`/api/admin/plans/${p.id}`, { limits: { ai_budget: v } }); };

before(async () => {
  ({ server, base } = await start());
  K = new Client(base); root = new Client(base);
  await K.register('Tienda Kappa', 'kappa@test.com'); await root.login('root@lc.test', 'SuperSecreta123');
  cid = (await K.get('/api/auth/me')).body.company.id;
  await root.req('PATCH', `/api/admin/companies/${cid}`, { planCode: 'enterprise' });
  agent = (await K.post('/api/agents', { name: 'Eva', type: 'attention', status: 'active' })).body.agent;
});
after(async () => { server.close(); await db.close(); });

test('sin precios cargados el costo es desconocido y no se bloquea nada', async () => {
  await addUsage('gpt-test', 1_000_000, 500_000);
  const b = (await K.get('/api/billing')).body;
  assert.equal(b.usage.ai_cost, 0); assert.ok(b.usage.ai_cost_unpriced_tokens >= 1_500_000); // tokens sin precio: se informan, no se inventan
  assert.equal((await K.post(`/api/ai/agents/${agent.id}/test`, { message: 'hola' })).status, 200);
});

test('SUPER ADMIN carga precios; el gasto se calcula por modelo', async () => {
  assert.equal((await K.put('/api/admin/pricing', { models: {} })).status, 403);
  assert.equal((await root.put('/api/admin/pricing', { models: { 'gpt-test': { in: -1, out: 2 } } })).status, 400);
  assert.equal((await root.put('/api/admin/pricing', { currency: 'USD', models: { 'gpt-test': { in: 1, out: 2 } } })).status, 200);
  assert.equal((await root.get('/api/admin/pricing')).body.pricing.models['gpt-test'].out, 2);
  const u = (await K.get('/api/billing')).body.usage;
  assert.equal(u.ai_cost, 2); assert.equal(u.currency, 'USD'); // 1 M × 1 + 0,5 M × 2
  await addUsage('modelo-sin-precio', 600, 400);
  assert.equal((await K.get('/api/billing')).body.usage.ai_cost_unpriced_tokens, 1000);
});

test('el presupuesto mensual de IA bloquea cuando se alcanza y se libera al subirlo', async () => {
  await setBudget(2);
  const t = await K.post(`/api/ai/agents/${agent.id}/test`, { message: 'otra prueba' });
  assert.equal(t.status, 402); assert.match(t.body.error.message, /presupuesto de IA/);
  const key = (await K.get('/api/auth/me')).body.company.public_key;
  const c = new Client(base);
  const w = await c.post(`/api/widget/${key}/chat`, { visitorId: 'visitante-kkkkkkkkkkkkkkkk', message: 'hola' }, { noCsrf: true });
  assert.equal(w.status, 200); assert.match(w.body.reply, /no podemos responderte automáticamente/); assert.equal(w.body.status, 'needs_human'); // el cliente no ve errores técnicos
  const n = (await K.get('/api/notifications')).body.notifications.find((x) => x.title === 'Límite de plan alcanzado'); assert.match(n.body, /presupuesto de IA/);
  await setBudget(5);
  assert.equal((await K.post(`/api/ai/agents/${agent.id}/test`, { message: 'ahora sí' })).status, 200);
  await setBudget(-1);
  assert.equal((await K.post(`/api/ai/agents/${agent.id}/test`, { message: 'sin tope' })).status, 200);
});
