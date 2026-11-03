'use strict';
process.env.MP_ACCESS_TOKEN = 'TEST-mp-token';
process.env.MP_WEBHOOK_SECRET = 'mp-webhook-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { start, Client, db } = require('./helpers');
const billing = require('../src/services/billing');

let server; let base; let G; let H; let root; let gid; let mpCalls = []; let mpState = { status: 'authorized' };
const sign = (id, ts = '1700000000', reqId = 'req-1') => ({ 'x-signature': `ts=${ts},v1=${crypto.createHmac('sha256', 'mp-webhook-secret').update(`id:${String(id).toLowerCase()};request-id:${reqId};ts:${ts};`).digest('hex')}`, 'x-request-id': reqId });

before(async () => {
  ({ server, base } = await start());
  G = new Client(base); H = new Client(base); root = new Client(base);
  await G.register('Galería Gamma', 'g4@test.com'); await H.register('Hotel Eta', 'h4@test.com'); await root.login('root@lc.test', 'SuperSecreta123');
  gid = (await G.get('/api/auth/me')).body.company.id;
  billing.setTransport(async (url, opts) => {
    mpCalls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.endsWith('/preapproval')) return { status: 201, headers: {}, body: Buffer.from(JSON.stringify({ id: 'PRE-123', init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=PRE-123' })) };
    if (url.includes('/preapproval/PRE-123')) return { status: 200, headers: {}, body: Buffer.from(JSON.stringify({ id: 'PRE-123', status: mpState.status, external_reference: `${gid}:business`, next_payment_date: '2027-01-03T00:00:00.000Z' })) };
    return { status: 404, headers: {}, body: Buffer.from('{}') };
  });
});
after(async () => { server.close(); await db.close(); });

test('marketplace: catálogo de 9 plantillas, instalación con conocimiento y límites del plan', async () => {
  const m = await G.get('/api/marketplace');
  assert.equal(m.body.templates.length, 9);
  assert.ok(['ferreteria', 'restaurante', 'inmobiliaria', 'taller', 'indumentaria', 'distribuidora', 'profesionales', 'hotel', 'ecommerce'].every((s) => m.body.templates.some((t) => t.slug === s)));
  const r = await G.post('/api/marketplace/ferreteria/install');
  assert.equal(r.status, 201, r.text); assert.equal(r.body.documents, 1); assert.equal(r.body.next_steps.length, 4);
  const ag = (await G.get(`/api/agents/${r.body.agent.id}`)).body.agent;
  assert.equal(ag.status, 'draft'); assert.ok(ag.tools.includes('create_quote')); assert.deepEqual(ag.approvals, ['create_quote']);
  const docs = (await G.get('/api/documents')).body.documents; assert.equal(docs.length, 1); assert.equal(docs[0].agent_id, ag.id);
  assert.equal((await G.post('/api/marketplace/restaurante/install')).status, 402); // START: 1 agente
  assert.equal((await G.get('/api/marketplace')).body.templates.find((t) => t.slug === 'ferreteria').installed, 1);
  assert.equal((await H.get('/api/agents')).body.agents.length, 0); // aislamiento
  assert.equal((await G.post('/api/marketplace/no-existe/install')).status, 404);
  // admin: despublicar oculta la plantilla
  const tpls = (await root.get('/api/admin/templates')).body.templates; const hotel = tpls.find((t) => t.slug === 'hotel');
  assert.equal(hotel.installs, 0);
  await root.put(`/api/admin/templates/${hotel.id}`, { status: 'draft' });
  assert.equal((await H.get('/api/marketplace')).body.templates.length, 8);
  assert.equal((await H.post('/api/marketplace/hotel/install')).status, 404);
  assert.equal((await G.post('/api/admin/templates', {})).status, 403);
  const nt = await root.post('/api/admin/templates', { slug: 'gimnasio', name: 'Agente para Gimnasios', status: 'published', config: { agent: { type: 'attention' }, tools: ['search_knowledge'], knowledge: [{ title: 'Planes', content: 'Planes y precios: [COMPLETAR]' }] } });
  assert.equal(nt.status, 201); assert.equal((await root.post('/api/admin/templates', { slug: 'gimnasio', name: 'Dup', config: { tools: [], knowledge: [] } })).status, 409);
  assert.equal((await H.get('/api/marketplace')).body.templates.length, 9);
});

test('límites de consumo: conversaciones y tokens mensuales, y almacenamiento', async () => {
  const ag = (await G.get('/api/agents')).body.agents[0];
  await G.put(`/api/agents/${ag.id}`, { status: 'active' });
  const plans = (await root.get('/api/admin/plans')).body.plans; const start = plans.find((p) => p.code === 'start');
  await root.put(`/api/admin/plans/${start.id}`, { limits: { conversations: 2, ai_tokens: 100000, storage_mb: 1, documents: 10, agents: 3 } });
  const key = (await G.get('/api/auth/me')).body.company.public_key;
  const c = new Client(base);
  const chat = (v, msg, conv) => c.post(`/api/widget/${key}/chat`, { visitorId: v, message: msg, conversationId: conv }, { noCsrf: true });
  const a = await chat('visitante-aaaaaaaaaaaaaaaa', 'hola'); assert.equal(a.status, 200);
  const b = await chat('visitante-bbbbbbbbbbbbbbbb', 'hola'); assert.equal(b.status, 200);
  const third = await chat('visitante-cccccccccccccccc', 'hola');
  assert.equal(third.status, 200); assert.match(third.body.reply, /no podemos responderte automáticamente/); assert.equal(third.body.status, 'needs_human');
  const again = await chat('visitante-aaaaaaaaaaaaaaaa', 'otra consulta', a.body.conversationId); // conversación existente sigue funcionando
  assert.equal(again.status, 200); assert.doesNotMatch(again.body.reply || '', /no podemos responderte/);
  const n = (await G.get('/api/notifications')).body.notifications.filter((x) => x.title === 'Límite de plan alcanzado'); assert.equal(n.length, 1);
  const t2 = await G.post(`/api/ai/agents/${ag.id}/test`, { message: 'prueba nueva' }); // 3 conversaciones creadas en el mes > límite 2
  assert.equal(t2.status, 402); assert.match(t2.body.error.message, /límite de conversaciones/);
  // tokens
  await root.put(`/api/admin/plans/${start.id}`, { limits: { conversations: 1000, ai_tokens: 1, storage_mb: 1, documents: 10, agents: 3 } });
  const t3 = await G.post(`/api/ai/agents/${ag.id}/test`, { message: 'consulta nueva' });
  assert.equal(t3.status, 402); assert.match(t3.body.error.message, /consumo de IA/);
  // almacenamiento (1 MB)
  const big = 'palabra '.repeat(150000);
  assert.equal((await G.post('/api/documents/text', { title: 'Enorme', content: big.slice(0, 199000) })).status, 201);
  const fd = new FormData(); fd.append('file', new Blob(['x'.repeat(1_100_000)]), 'grande.txt');
  const up = await G.req('POST', '/api/documents/upload', fd); assert.equal(up.status, 402); assert.match(up.body.error.message, /almacenamiento/);
});

test('facturación: uso del mes, plan sin precio, checkout Mercado Pago y webhook firmado', async () => {
  const b = await G.get('/api/billing');
  assert.equal(b.status, 200); assert.equal(b.body.plan.code, 'start'); assert.ok(b.body.usage.agents >= 1); assert.equal(b.body.plans.length, 4); assert.equal(b.body.online_payments, true);
  assert.equal((await G.post('/api/billing/checkout', { planCode: 'business' })).status, 409); // sin precio definido
  assert.equal((await G.post('/api/billing/request-change', { planCode: 'business', message: 'Queremos pasar a BUSINESS' })).status, 200);
  assert.ok((await root.get('/api/admin/audit')).body.logs.some((l) => l.action === 'billing.plan_request'));
  const plans = (await root.get('/api/admin/plans')).body.plans; const biz = plans.find((p) => p.code === 'business');
  await root.put(`/api/admin/plans/${biz.id}`, { price_cents: 4500000 });
  const co = await G.post('/api/billing/checkout', { planCode: 'business' });
  assert.equal(co.status, 200, co.text); assert.match(co.body.url, /mercadopago/);
  const call = mpCalls.find((x) => x.url.endsWith('/preapproval')); assert.equal(call.body.auto_recurring.transaction_amount, 45000); assert.equal(call.body.external_reference, `${gid}:business`);
  assert.equal((await G.get('/api/billing')).body.invoices[0].status, 'pending');
  // webhook: sin firma / firma inválida → 403 y el plan NO cambia
  const wh = (headers, q = 'data.id=PRE-123') => fetch(`${base}/api/webhooks/mercadopago?${q}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ type: 'subscription_preapproval', data: { id: 'PRE-123' } }) });
  assert.equal((await wh({})).status, 403);
  assert.equal((await wh({ 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'r' })).status, 403);
  assert.equal((await G.get('/api/billing')).body.plan.code, 'start');
  assert.equal((await wh(sign('PRE-123'))).status, 200);
  await new Promise((r) => setTimeout(r, 300));
  const after = (await G.get('/api/billing')).body;
  assert.equal(after.plan.code, 'business'); assert.equal(after.subscription.provider, 'mercadopago'); assert.equal(after.invoices[0].status, 'paid');
  // cancelación → vuelve a START
  mpState = { status: 'cancelled' };
  await wh(sign('PRE-123')); await new Promise((r) => setTimeout(r, 300));
  assert.equal((await G.get('/api/billing')).body.plan.code, 'start');
  assert.deepEqual((await H.get('/api/billing')).body.invoices, []);
  assert.equal((await (await new Client(base).csrf()).post('/api/billing/checkout', { planCode: 'start' })).status, 401);
});

test('facturación manual (transferencia) desde SUPER ADMIN', async () => {
  const inv = await root.post(`/api/admin/companies/${gid}/invoices`, { planCode: 'professional', amount: 120000, description: 'Transferencia octubre', months: 3 });
  assert.equal(inv.status, 201);
  const b = (await G.get('/api/billing')).body;
  assert.equal(b.plan.code, 'professional'); assert.equal(b.subscription.provider, 'manual'); assert.ok(b.invoices.some((i) => i.provider === 'manual' && i.status === 'paid'));
  assert.equal((await G.post(`/api/admin/companies/${gid}/invoices`, { planCode: 'start', amount: 1 })).status, 403);
  assert.ok((await root.get('/api/admin/invoices')).body.invoices.length >= 2);
  // un operador no ve ni toca la facturación
  await G.post('/api/users', { name: 'Ope', email: 'ope4@test.com', password: 'ClaveSegura123', role: 'operator' });
  const o = await new Client(base).csrf(); await o.post('/api/auth/login', { email: 'ope4@test.com', password: 'ClaveSegura123' });
  assert.equal((await o.get('/api/billing')).status, 403);
});
