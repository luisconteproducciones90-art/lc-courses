'use strict';
process.env.ALLOW_PRIVATE_URLS = '1'; // los receptores de prueba corren en 127.0.0.1
process.env.ENCRYPTION_KEY = 'test-encryption-key-test-encryption-key-1234';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const { start, Client, db } = require('./helpers');
const wa = require('../src/services/whatsapp');

let server; let base; let E; let F; let root; let ekey; let eid; let agent; let sent = []; let recv; let recvUrl; let received = []; let ext; let extUrl; let extAuth = [];
const hex = (s, b) => crypto.createHmac('sha256', s).update(b).digest('hex');

before(async () => {
  ({ server, base } = await start());
  E = new Client(base); F = new Client(base); root = new Client(base);
  await E.register('Tienda Épsilon', 'eps@test.com'); await F.register('Tienda Zeta', 'zeta@test.com'); await root.login('root@lc.test', 'SuperSecreta123');
  const me = (await E.get('/api/auth/me')).body.company; eid = me.id; ekey = me.public_key;
  await root.req('PATCH', `/api/admin/companies/${eid}`, { planCode: 'enterprise' });
  agent = (await E.post('/api/agents', { name: 'Eva', type: 'attention', status: 'active', welcome_message: 'Hola, soy Eva' })).body.agent;
  await E.post('/api/documents/text', { title: 'Horarios', content: 'Nuestro horario de atención es de lunes a viernes de 9 a 18 horas en el local.' });
  await E.post('/api/products', { name: 'Taladro Bosch', sku: 'TAL-1', price: 100, stock: 5, stock_min: 2 });
  wa.setTransport(async (url, opts) => { sent.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null }); return { status: 200, headers: {}, body: Buffer.from(JSON.stringify({ messages: [{ id: `wamid.out${sent.length}` }], display_phone_number: '+54 11 5555 0000', verified_name: 'Épsilon' })) }; });
  recv = http.createServer((req, res) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => { received.push({ headers: req.headers, body: Buffer.concat(c).toString() }); res.end('ok'); }); });
  await new Promise((r) => recv.listen(0, '127.0.0.1', r)); recvUrl = `http://127.0.0.1:${recv.address().port}/hook`;
  ext = http.createServer((req, res) => { extAuth.push(req.headers.authorization || req.headers['x-api-key']); const u = new URL(req.url, 'http://x'); const page = Number(u.searchParams.get('page') || 1);
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/bad') { res.statusCode = 500; return res.end('{}'); }
    res.end(JSON.stringify({ data: page === 1 ? [{ codigo: 'EXT-1', nombre: 'Llave inglesa', precio: 4500, existencias: 10, marca: 'Tramontina' }, { codigo: 'EXT-2', nombre: 'Pinza', precio: 3200, existencias: 1 }] : [] })); });
  await new Promise((r) => ext.listen(0, '127.0.0.1', r)); extUrl = `http://127.0.0.1:${ext.address().port}`;
});
after(async () => { server.close(); recv.close(); ext.close(); await db.close(); });

test('widget: config pública, chat, historial, orígenes permitidos y aislamiento', async () => {
  const c = new Client(base);
  const cfg = await c.get(`/api/widget/${ekey}/config`);
  assert.equal(cfg.status, 200); assert.equal(cfg.body.agent.name, 'Eva'); assert.ok(!JSON.stringify(cfg.body).includes(eid));
  assert.equal((await c.get('/api/widget/lcb_000000000000000000000000/config')).status, 404);
  assert.equal((await c.get('/api/widget/nada/config')).status, 404);
  const vid = 'visitante-abcdefghijklmnop';
  const r = await c.post(`/api/widget/${ekey}/chat`, { visitorId: vid, message: '¿Cuál es el horario de atención?' }, { noCsrf: true });
  assert.equal(r.status, 200, r.text); assert.match(r.body.reply, /lunes a viernes/);
  const h = await c.get(`/api/widget/${ekey}/messages?visitorId=${vid}&conversationId=${r.body.conversationId}`);
  assert.equal(h.body.messages.length, 2);
  assert.equal((await c.get(`/api/widget/${ekey}/messages?visitorId=otro-visitante-123456&conversationId=${r.body.conversationId}`)).status, 404);
  // la conversación aparece en la bandeja y una persona puede responder
  const conv = (await E.get('/api/conversations')).body.conversations.find((x) => x.channel === 'widget');
  assert.ok(conv);
  await E.post(`/api/conversations/${conv.id}/messages`, { content: 'Hola, soy Luis del equipo' });
  const h2 = await c.get(`/api/widget/${ekey}/messages?visitorId=${vid}&conversationId=${r.body.conversationId}&after=${encodeURIComponent(h.body.messages.at(-1).created_at)}`);
  assert.ok(h2.body.messages.some((m) => m.role === 'human' && /Luis/.test(m.content)));
  // otra empresa no puede usar la clave de E ni su conversación
  assert.equal((await F.get('/api/conversations')).body.conversations.length, 0);
  // orígenes
  await E.put('/api/integrations/widget', { allowed_origins: ['https://mitienda.com'] });
  const bad = await c.req('GET', `/api/widget/${ekey}/config`, undefined, { headers: { origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
  const good = await c.req('GET', `/api/widget/${ekey}/config`, undefined, { headers: { origin: 'https://mitienda.com' } });
  assert.equal(good.status, 200); assert.equal(good.headers.get('access-control-allow-origin'), 'https://mitienda.com');
  assert.equal((await E.put('/api/integrations/widget', { allowed_origins: ['no-es-origen'] })).status, 400);
  await E.put('/api/integrations/widget', { allowed_origins: [] });
  const js = await new Client(base).get('/lc-ai-widget.js'); assert.equal(js.status, 200); assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal(js.headers.get('cross-origin-resource-policy'), 'cross-origin'); // cargable desde sitios de terceros
  const pre = await fetch(`${base}/api/widget/${ekey}/chat`, { method: 'OPTIONS', headers: { origin: 'https://cliente.example', 'access-control-request-method': 'POST' } });
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), 'https://cliente.example');
});

const SECRET = 'app-secret-de-meta-123';
const payload = (id, from, text, extra = {}) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: from, profile: { name: 'Marta Ruiz' } }], messages: [{ from, id, type: 'text', text: { body: text }, ...extra }] } }] }] });
async function post(body, key = ekey, secret = SECRET, sig) {
  const raw = JSON.stringify(body);
  return fetch(`${base}/api/webhooks/whatsapp/${key}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig ?? `sha256=${hex(secret, raw)}` }, body: raw });
}

test('WhatsApp: configuración sin exponer secretos y cifrados en la base', async () => {
  assert.equal((await E.put('/api/whatsapp/config', { phone_number_id: '123456789012', agent_id: agent.id })).status, 400); // falta token y secret
  const cfg = await E.put('/api/whatsapp/config', { phone_number_id: '123456789012', access_token: 'EAAG-token-super-secreto', app_secret: SECRET, verify_token: 'verify-token-123', agent_id: agent.id });
  assert.equal(cfg.status, 200); assert.equal(cfg.body.has_access_token, true);
  assert.ok(!cfg.text.includes('EAAG-token') && !cfg.text.includes(SECRET));
  assert.match(cfg.body.webhook_url, new RegExp(`/api/webhooks/whatsapp/${ekey}$`));
  const raw = await db.system((q) => q("SELECT secrets FROM integrations WHERE provider = 'whatsapp'"));
  assert.ok(!raw[0].secrets.includes('EAAG-token') && raw[0].secrets.startsWith('v1.'));
  assert.equal((await E.post('/api/whatsapp/config/test')).body.ok, true);
  assert.equal((await F.get('/api/whatsapp/config')).body.configured, false);
});

test('WhatsApp: verificación, firma HMAC, mensaje entrante → IA → respuesta, idempotencia y estados', async () => {
  const ok = await fetch(`${base}/api/webhooks/whatsapp/${ekey}?hub.mode=subscribe&hub.verify_token=verify-token-123&hub.challenge=CHAL123`);
  assert.equal(await ok.text(), 'CHAL123');
  assert.equal((await fetch(`${base}/api/webhooks/whatsapp/${ekey}?hub.mode=subscribe&hub.verify_token=mal&hub.challenge=X`)).status, 403);
  assert.equal((await post(payload('wamid.1', '5491155550001', 'hola'), ekey, SECRET, 'sha256=00')).status, 403);
  assert.equal((await post(payload('wamid.1', '5491155550001', 'hola'), ekey, 'otro-secreto')).status, 403);
  assert.equal((await fetch(`${base}/api/webhooks/whatsapp/${ekey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
  sent = [];
  assert.equal((await post(payload('wamid.2', '5491155550001', '¿Cuál es el horario de atención?'))).status, 200);
  await wa.idle();
  const out = sent.find((s) => s.body?.type === 'text');
  assert.ok(out); assert.equal(out.body.to, '5491155550001'); assert.match(out.body.text.body, /lunes a viernes/);
  assert.equal(out.opts.headers.authorization, 'Bearer EAAG-token-super-secreto');
  const conv = (await E.get('/api/conversations')).body.conversations.find((c) => c.channel === 'whatsapp');
  assert.ok(conv); assert.equal(conv.contact_name, 'Marta Ruiz');
  const cust = (await E.get('/api/customers?q=Marta')).body.customers[0];
  assert.equal(cust.whatsapp, '5491155550001'); assert.equal(cust.source, 'whatsapp');
  // reentrega del mismo mensaje: no duplica ni responde dos veces
  const before = sent.length;
  await post(payload('wamid.2', '5491155550001', '¿Cuál es el horario de atención?')); await wa.idle();
  assert.equal(sent.length, before);
  // segundo mensaje continúa la misma conversación
  await post(payload('wamid.3', '5491155550001', 'quiero hablar con una persona')); await wa.idle();
  const convs = (await E.get('/api/conversations')).body.conversations.filter((c) => c.channel === 'whatsapp');
  assert.equal(convs.length, 1); assert.equal(convs[0].status, 'needs_human');
  // no-texto
  sent = []; await post(payload('wamid.4', '5491155550002', '', { type: 'image', text: undefined })); await wa.idle();
  assert.match(sent[0].body.text.body, /solo puedo leer mensajes de texto/);
  // estados de entrega
  const st = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.out1', status: 'read' }] } }] }] };
  await post(st); await wa.idle();
  const m = await db.system((q) => q("SELECT meta FROM messages WHERE external_id = 'wamid.out1'"));
  assert.equal(m[0]?.meta?.wa_status, 'read');
  // otra empresa no recibe nada con esta firma/clave
  assert.equal((await post(payload('wamid.9', '5491100000000', 'hola'), (await F.get('/api/auth/me')).body.company.public_key)).status, 404);
});

test('WhatsApp: respuesta de operador, ventana de 24 h y plantillas', async () => {
  const conv = (await E.get('/api/conversations')).body.conversations.find((c) => c.channel === 'whatsapp' && c.contact_name === 'Marta Ruiz');
  sent = [];
  const r = await E.post(`/api/conversations/${conv.id}/messages`, { content: 'Hola Marta, te ayudo yo.' });
  assert.equal(r.body.delivery.delivered, true); assert.equal(sent[0].body.text.body, 'Hola Marta, te ayudo yo.');
  await db.system((q) => q("UPDATE messages SET created_at = now() - interval '30 hours' WHERE role = 'customer' AND conversation_id = $1", [conv.id]));
  const late = await E.post(`/api/conversations/${conv.id}/messages`, { content: 'Tarde' });
  assert.equal(late.body.delivery.delivered, false); assert.match(late.body.delivery.reason, /24 hs/);
  assert.equal((await E.post('/api/whatsapp/templates', { name: 'Mal Nombre', body: 'x' })).status, 400);
  assert.equal((await E.post('/api/whatsapp/templates', { name: 'recordatorio_turno', language: 'es', body: 'Hola {{1}}, tu turno es {{2}}' })).status, 201);
  sent = [];
  const t = await E.post('/api/whatsapp/send-template', { to: '5491155550001', template: 'recordatorio_turno', variables: ['Marta', 'mañana 10:00'] });
  assert.equal(t.status, 200); assert.equal(sent[0].body.template.name, 'recordatorio_turno'); assert.equal(sent[0].body.template.components[0].parameters[1].text, 'mañana 10:00');
  assert.equal((await E.post('/api/whatsapp/send-template', { to: '5491155550001', template: 'inexistente' })).status, 404);
  assert.equal((await F.post('/api/whatsapp/send-template', { to: '5491155550001', template: 'recordatorio_turno' })).status, 400);
});

test('API v1 con API keys: scopes, sync de productos, revocación y aislamiento', async () => {
  const k = await E.post('/api/integrations/api-keys', { name: 'LC-SYSTEM BUSINESS', scopes: ['products:read', 'products:write', 'stock:read'] });
  assert.equal(k.status, 201); const secret = k.body.secret; assert.match(secret, /^lcb_sk_/);
  const stored = await db.system((q) => q('SELECT key_hash, prefix FROM api_keys'));
  assert.ok(stored.every((r) => r.key_hash !== secret && !r.key_hash.includes('lcb_sk_')));
  const api = (m, p, b, key = secret) => fetch(`${base}/api/v1${p}`, { method: m, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  assert.equal((await fetch(`${base}/api/v1/products`)).status, 401);
  assert.equal((await api('GET', '/products', undefined, 'lcb_sk_inventada_inventada_1234')).status, 401);
  const sync = await api('POST', '/products/sync', { products: [{ sku: 'API-1', name: 'Sierra circular', price: '12.500,50', stock: 7, stock_min: 2, category: 'Eléctricas' }, { sku: 'TAL-1', name: 'Taladro Bosch', price: 120, stock: 5 }, { name: 'sin sku' }] });
  const sj = await sync.json(); assert.equal(sync.status, 200); assert.equal(sj.created, 1); assert.equal(sj.updated, 1); assert.ok(sj.errors.length >= 1);
  assert.equal(Number((await (await api('GET', '/products?q=sierra')).json()).products[0].price), 12500.5);
  assert.equal((await (await api('GET', '/products/API-1/stock')).json()).availability, 'disponible');
  assert.equal((await api('GET', '/customers')).status, 403); // sin scope
  assert.equal((await api('PATCH', '/products/API-1/stock', { stock: 1 })).status, 200);
  assert.equal((await (await api('GET', '/products/API-1/stock')).json()).availability, 'últimas unidades');
  // la clave de E no ve datos de F
  const kf = await F.post('/api/integrations/api-keys', { name: 'clave-f', scopes: ['products:read', 'stock:read'] }); assert.equal(kf.status, 201, kf.text);
  assert.deepEqual((await (await api('GET', '/products', undefined, kf.body.secret)).json()).products, []);
  assert.equal((await (await api('GET', '/products/API-1/stock', undefined, kf.body.secret)).status), 404);
  assert.equal((await E.get('/api/integrations')).body.api_keys.length, 1);
  assert.equal((await E.del(`/api/integrations/api-keys/${k.body.api_key.id}`)).status, 200);
  assert.equal((await api('GET', '/products')).status, 401);
});

test('webhooks salientes firmados y conector REST (LC-SYSTEM BUSINESS)', async () => {
  const w = await E.post('/api/integrations/webhooks', { url: recvUrl, events: ['stock.low', 'lead.created'] });
  assert.equal(w.status, 201); const whsec = w.body.secret;
  const k = await E.post('/api/integrations/api-keys', { name: 'sync', scopes: ['products:write', 'stock:read'] });
  await fetch(`${base}/api/v1/products/TAL-1/stock`, { method: 'PATCH', headers: { authorization: `Bearer ${k.body.secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ stock: 1 }) }); // 5 → 1 (mín 2)
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(received.length, 1);
  const rc = received[0]; assert.equal(rc.headers['x-lc-event'], 'stock.low');
  assert.equal(rc.headers['x-lc-signature'], `sha256=${hex(whsec, `${rc.headers['x-lc-timestamp']}.${rc.body}`)}`);
  assert.equal(JSON.parse(rc.body).data.productId.length, 36);
  assert.equal((await E.get('/api/integrations/webhooks/events')).body.events[0].status_code, 200);
  assert.equal((await E.post('/api/integrations/webhooks', { url: 'ftp://x.com', events: ['stock.low'] })).status, 400);
  assert.equal((await F.get('/api/integrations')).body.webhooks.length, 0);
  // conector
  const cn = await E.post('/api/integrations/connectors', { preset: 'lc-system-business', name: 'LC-SYSTEM BUSINESS', base_url: extUrl, products_path: '/api/products', items_path: 'data', paginate: true, token: 'tok-externo', field_map: { sku: 'codigo', name: 'nombre', price: 'precio', stock: 'existencias', brand: 'marca' } });
  assert.equal(cn.status, 201, cn.text);
  const sy = await E.post(`/api/integrations/connectors/${cn.body.connector.id}/sync`);
  assert.equal(sy.body.ok, true, sy.text); assert.equal(sy.body.result.created, 2);
  assert.ok(extAuth.includes('Bearer tok-externo'));
  assert.equal(Number((await E.get('/api/products?q=llave')).body.products[0].price), 4500);
  const bad = await E.post('/api/integrations/connectors', { name: 'Roto', base_url: extUrl, products_path: '/bad' });
  const sy2 = await E.post(`/api/integrations/connectors/${bad.body.connector.id}/sync`);
  assert.equal(sy2.body.ok, false);
  const list = (await E.get('/api/integrations')).body.connectors;
  assert.equal(list.find((c) => c.name === 'Roto').status, 'error'); assert.equal(list.find((c) => c.name === 'LC-SYSTEM BUSINESS').status, 'active');
  assert.ok(!JSON.stringify(list).includes('tok-externo'));
  assert.equal((await F.post(`/api/integrations/connectors/${cn.body.connector.id}/sync`)).status, 404);
});

test('contrato OpenAPI público del ecosistema', async () => {
  const r = await new Client(base).get('/api/v1/openapi.json');
  assert.equal(r.status, 200); assert.equal(r.body.openapi, '3.0.3');
  assert.ok(r.body.paths['/products/sync'] && r.body.paths['/orders'] && r.body['x-webhooks'].events.includes('stock.low'));
});
