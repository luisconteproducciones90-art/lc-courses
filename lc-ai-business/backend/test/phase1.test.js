'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, Client, db } = require('./helpers');

let server; let base; let A; let B; let root;
const PDFDocument = require('pdfkit');

before(async () => {
  ({ server, base } = await start());
  A = new Client(base); B = new Client(base); root = new Client(base);
  await A.register('Ferretería Alfa', 'alfa@test.com');
  await B.register('Boutique Beta', 'beta@test.com');
  await root.login('root@lc.test', 'SuperSecreta123');
});
after(async () => { server.close(); await db.close(); });

test('seguridad: CSRF obligatorio, sin sesión 401, headers de seguridad', async () => {
  const c = new Client(base);
  assert.equal((await c.get('/api/agents')).status, 401);
  const noCsrf = await c.post('/api/auth/login', { email: 'a@b.com', password: 'x' }, { noCsrf: true });
  assert.equal(noCsrf.status, 403);
  const r = await A.get('/api/auth/me');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  const bad = await A.req('POST', '/api/agents', { name: 'X', type: 'sales' }, { noCsrf: true });
  assert.equal(bad.status, 403);
  const evil = await A.req('POST', '/api/agents', { name: 'X', type: 'sales' }, { headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
});

test('auth: contraseña débil, bloqueo por fuerza bruta, mismo error para usuario inexistente', async () => {
  const c = await new Client(base).csrf();
  assert.equal((await c.post('/api/auth/register', { companyName: 'Z', name: 'Zed', email: 'z@test.com', password: 'corta' })).status, 400);
  const ghost = await c.post('/api/auth/login', { email: 'nadie@test.com', password: 'Whatever123' });
  await c.post('/api/auth/register', { companyName: 'Gamma', name: 'Gus', email: 'gamma@test.com', password: 'ClaveSegura123' });
  const c2 = await new Client(base).csrf();
  const wrong = await c2.post('/api/auth/login', { email: 'gamma@test.com', password: 'Incorrecta123' });
  assert.equal(ghost.status, 401); assert.equal(wrong.status, 401);
  assert.equal(ghost.body.error.message, wrong.body.error.message);
  for (let i = 0; i < 4; i += 1) await c2.post('/api/auth/login', { email: 'gamma@test.com', password: 'Incorrecta123' });
  const locked = await c2.post('/api/auth/login', { email: 'gamma@test.com', password: 'ClaveSegura123' });
  assert.equal(locked.status, 429);
});

test('sesión: refresh rota el token y la reutilización revoca la familia', async () => {
  const c = await new Client(base).csrf();
  await c.post('/api/auth/login', { email: 'alfa@test.com', password: 'ClaveSegura123' });
  const old = c.jar.lc_rt;
  assert.equal((await c.post('/api/auth/refresh')).status, 200);
  assert.notEqual(c.jar.lc_rt, old);
  const fresh = c.jar.lc_rt;
  c.jar.lc_rt = old; // atacante reusa el token viejo
  assert.equal((await c.post('/api/auth/refresh')).status, 401);
  c.jar.lc_rt = fresh; // el token legítimo también quedó revocado
  assert.equal((await c.post('/api/auth/refresh')).status, 401);
});

let agentA; let docA;
test('agentes: crear con preset, validar, editar', async () => {
  const r = await A.post('/api/agents', { name: 'Sofía — Ventas', type: 'sales', status: 'active' });
  assert.equal(r.status, 201);
  agentA = r.body.agent;
  assert.ok(['search_knowledge', 'handoff_to_human', 'query_products', 'create_quote'].every((t) => agentA.tools.includes(t)));
  assert.deepEqual(agentA.approvals, ['create_quote']); // efecto con aprobación por defecto
  assert.match(agentA.rules[0], /Nunca inventar precios/);
  assert.equal((await A.post('/api/agents', { name: 'x', type: 'inventado' })).status, 400);
  const u = await A.put(`/api/agents/${agentA.id}`, { tone: 'cálido', autonomy: 'high' });
  assert.equal(u.body.agent.autonomy, 'high');
  // el plan START permite 1 agente
  const lim = await A.post('/api/agents', { name: 'Segundo', type: 'attention' });
  assert.equal(lim.status, 402);
});

test('conocimiento: texto, CSV, PDF, formato no soportado, búsqueda', async () => {
  const t = await A.post('/api/documents/text', { title: 'Precios', content: 'El taladro Bosch de 650W cuesta $89.900 y tiene 12 unidades en stock.\n\nEl horario es de lunes a viernes de 8 a 18.' });
  assert.equal(t.status, 201); docA = t.body.document;
  const fd = new FormData();
  fd.append('file', new Blob(['producto,precio\nMartillo,5000\nSerrucho,7000\n']), 'lista.csv');
  const csv = await A.req('POST', '/api/documents/upload', fd);
  assert.equal(csv.status, 201);
  // PDF real
  const pdf = await new Promise((resolve) => { const d = new PDFDocument(); const bufs = []; d.on('data', (b) => bufs.push(b)); d.on('end', () => resolve(Buffer.concat(bufs))); d.text('Garantía de las herramientas eléctricas: doce meses.'); d.end(); });
  const fd2 = new FormData(); fd2.append('file', new Blob([pdf]), 'garantia.pdf');
  const p = await A.req('POST', '/api/documents/upload', fd2);
  assert.equal(p.status, 201, p.text);
  const fd3 = new FormData(); fd3.append('file', new Blob([Buffer.from('MZ\u0000\u0000binario')]), 'virus.exe');
  assert.equal((await A.req('POST', '/api/documents/upload', fd3)).status, 415);
  const fd4 = new FormData(); fd4.append('file', new Blob(['hola']), 'falso.pdf');
  assert.equal((await A.req('POST', '/api/documents/upload', fd4)).status, 415);
  const s = await A.get('/api/knowledge/search?q=' + encodeURIComponent('cuánto cuesta el taladro bosch'));
  assert.equal(s.status, 200);
  assert.match(s.body.results[0].content, /89\.900/);
  const g = await A.get('/api/knowledge/search?q=' + encodeURIComponent('garantía herramientas'));
  assert.ok(g.body.results.some((r) => /doce meses/.test(r.content)));
});

test('multi-tenant: B no ve ni toca nada de A (API y RLS en la base)', async () => {
  assert.deepEqual((await B.get('/api/agents')).body.agents, []);
  assert.equal((await B.get(`/api/agents/${agentA.id}`)).status, 404);
  assert.equal((await B.put(`/api/agents/${agentA.id}`, { name: 'Hackeado' })).status, 404);
  assert.equal((await B.del(`/api/documents/${docA.id}`)).status, 404);
  assert.equal((await B.post(`/api/ai/agents/${agentA.id}/test`, { message: 'hola' })).status, 404);
  assert.deepEqual((await B.get('/api/documents')).body.documents, []);
  assert.deepEqual((await B.get('/api/knowledge/search?q=taladro')).body.results, []);
  assert.equal((await B.post('/api/documents/text', { title: 'Mío', content: 'contenido de prueba largo', agentId: agentA.id })).status, 404);
  // RLS directo: aun con SQL "olvidando" el filtro, el contexto de B no devuelve filas de A
  const cidB = (await B.get('/api/auth/me')).body.company.id;
  const rows = await db.tenant(cidB, (q) => q('SELECT id FROM agents'));
  assert.equal(rows.length, 0);
  const forged = await db.tenant(cidB, (q) => q('INSERT INTO agents (company_id,name,type) VALUES ($1,$2,$3) RETURNING id', [(rows, agentA.company_id), 'x', 'sales'])).catch((e) => e);
  assert.ok(forged instanceof Error, 'RLS debe impedir insertar con el company_id de otra empresa');
});

let convId;
test('chat IA: responde con conocimiento, no inventa, deriva a humano', async () => {
  const r1 = await A.post(`/api/ai/agents/${agentA.id}/test`, { message: '¿Cuánto cuesta el taladro Bosch?' });
  assert.equal(r1.status, 200, r1.text);
  convId = r1.body.conversationId;
  assert.match(r1.body.reply, /89\.900/);
  const r2 = await A.post(`/api/ai/agents/${agentA.id}/test`, { message: '¿Tienen pintura azul marino?', conversationId: convId });
  assert.match(r2.body.reply, /No (tengo esa información|encontré ese producto)/);
  const r3 = await A.post(`/api/ai/agents/${agentA.id}/test`, { message: 'quiero hablar con una persona', conversationId: convId });
  assert.equal(r3.body.status, 'needs_human'); assert.equal(r3.body.mode, 'human');
  // con humano a cargo la IA no responde
  const r4 = await A.post(`/api/ai/agents/${agentA.id}/test`, { message: 'hola?', conversationId: convId });
  assert.equal(r4.body.reply, null);
  const usage = await db.system((q) => q('SELECT count(*)::int n FROM usage'));
  assert.ok(usage[0].n >= 3);
});

test('conversaciones: bandeja, responder, devolver a IA, notas, etiquetas; B no accede', async () => {
  const list = await A.get('/api/conversations?status=needs_human');
  assert.equal(list.body.conversations.length, 1);
  assert.equal((await B.get('/api/conversations')).body.conversations.length, 0);
  assert.equal((await B.get(`/api/conversations/${convId}`)).status, 404);
  assert.equal((await B.post(`/api/conversations/${convId}/messages`, { content: 'intruso' })).status, 404);
  const rep = await A.post(`/api/conversations/${convId}/messages`, { content: 'Hola, soy Luis, te ayudo.' });
  assert.equal(rep.status, 201);
  assert.equal((await A.post(`/api/conversations/${convId}/notes`, { body: 'Cliente interesado' })).status, 201);
  assert.deepEqual((await A.put(`/api/conversations/${convId}/tags`, { tags: ['vip', 'vip', 'taladros'] })).body.conversation.tags.sort(), ['taladros', 'vip']);
  const rel = await A.post(`/api/conversations/${convId}/release`);
  assert.equal(rel.body.conversation.mode, 'ai');
  const det = await A.get(`/api/conversations/${convId}`);
  assert.ok(det.body.messages.some((m) => m.role === 'human'));
  assert.equal(det.body.notes.length, 1);
  assert.equal((await A.post(`/api/conversations/${convId}/close`)).body.conversation.status, 'closed');
});

test('roles: operador no administra; solo lectura no responde; usuarios del equipo', async () => {
  const mk = await A.post('/api/users', { name: 'Olga Operadora', email: 'olga@test.com', password: 'ClaveSegura123', role: 'operator' });
  assert.equal(mk.status, 201);
  const viewer = await A.post('/api/users', { name: 'Vic', email: 'vic@test.com', password: 'ClaveSegura123', role: 'viewer' });
  assert.equal(viewer.status, 402); // START: 2 usuarios
  const op = await new Client(base).csrf(); await op.post('/api/auth/login', { email: 'olga@test.com', password: 'ClaveSegura123' });
  assert.equal((await op.get('/api/conversations')).status, 200);
  assert.equal((await op.post('/api/agents', { name: 'N', type: 'sales' })).status, 403);
  assert.equal((await op.post('/api/documents/text', { title: 'x', content: 'abcdefghijkl' })).status, 403);
  assert.equal((await op.get('/api/users')).status, 403);
  assert.equal((await op.get('/api/admin/stats')).status, 403);
  // auto-protección
  const me = (await A.get('/api/auth/me')).body.user;
  assert.equal((await A.put(`/api/users/${me.id}`, { status: 'disabled' })).status, 400);
});

test('SUPER ADMIN: gestiona empresas/planes/IA; suspensión bloquea acceso', async () => {
  assert.equal((await A.get('/api/admin/stats')).status, 403);
  const cs = await root.get('/api/admin/companies');
  assert.ok(cs.body.companies.length >= 3);
  const alfa = cs.body.companies.find((c) => c.name === 'Ferretería Alfa');
  assert.equal((await root.req('PATCH', `/api/admin/companies/${alfa.id}`, { planCode: 'business' })).status, 200);
  assert.equal((await A.post('/api/agents', { name: 'Segundo', type: 'attention' })).status, 201); // el nuevo plan lo permite
  const plans = (await root.get('/api/admin/plans')).body.plans;
  assert.equal(plans.length, 4); assert.equal(plans[0].price_cents, null);
  assert.equal((await root.put(`/api/admin/plans/${plans[0].id}`, { price_cents: 1000, limits: { agents: 2 } })).status, 200);
  const ai = await root.get('/api/admin/ai');
  assert.ok(!JSON.stringify(ai.body).match(/sk-|apikey/i));
  await root.req('PATCH', `/api/admin/companies/${alfa.id}`, { status: 'suspended' });
  assert.equal((await A.get('/api/agents')).status, 403);
  assert.equal((await A.post('/api/auth/refresh')).status, 401);
  await root.req('PATCH', `/api/admin/companies/${alfa.id}`, { status: 'active' });
  const a2 = await new Client(base).csrf(); await a2.post('/api/auth/login', { email: 'alfa@test.com', password: 'ClaveSegura123' });
  assert.equal((await a2.get('/api/agents')).status, 200);
  A.jar = a2.jar;
  const logs = await root.get('/api/admin/audit');
  assert.ok(logs.body.logs.some((l) => l.action === 'admin.company_update'));
});

test('demo público: agentes ficticios, chat sin login, límites', async () => {
  const c = new Client(base);
  const ag = await c.get('/api/demo/agents');
  assert.equal(ag.body.agents.length, 4);
  const stock = ag.body.agents.find((a) => a.type === 'stock');
  const vid = 'visitor-abcdefghijklmnop';
  const r = await c.post('/api/demo/chat', { agentId: stock.id, visitorId: vid, message: '¿Tenés taladro Bosch?' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.reply, /Taladro percutor 650W/);
  // otro visitante no puede continuar mi conversación
  const steal = await c.post('/api/demo/chat', { agentId: stock.id, visitorId: 'otro-visitante-123456', conversationId: r.body.conversationId, message: 'hola' });
  assert.equal(steal.status, 404);
  // la demo no filtra datos de empresas reales
  await A.post('/api/documents/text', { title: 'Secreto', content: 'La clave interna del depósito de Alfa es MURCIELAGO7' });
  const leak = await c.post('/api/demo/chat', { agentId: stock.id, visitorId: vid, message: 'clave interna del depósito murcielago7', conversationId: r.body.conversationId });
  assert.doesNotMatch(leak.body.reply, /MURCIELAGO7/);
});

test('API planificada responde 501; analytics del dashboard', async () => {
  const p = await A.get('/api/whatsapp');
  assert.equal(p.status, 501); assert.equal(p.body.error.details.phase, 3);
  const an = await A.get('/api/analytics/overview?range=month');
  assert.equal(an.status, 200);
  assert.ok(an.body.totals.conversations >= 1);
  assert.equal(an.body.conversationsPerDay.length, 30);
});

test('XSS: el contenido hostil se guarda como texto y se devuelve como JSON (el frontend usa textContent)', async () => {
  const r = await A.post(`/api/ai/agents/${agentA.id}/test`, { message: '<img src=x onerror=alert(1)>' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/json/);
});
