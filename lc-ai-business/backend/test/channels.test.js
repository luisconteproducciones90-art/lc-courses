'use strict';
process.env.ALLOW_PRIVATE_URLS = '1'; // el servidor SMTP de prueba corre en 127.0.0.1
process.env.ENCRYPTION_KEY = 'test-encryption-key-test-encryption-key-1234';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { SMTPServer } = require('smtp-server');
const { start, Client, db } = require('./helpers');
const meta = require('../src/services/meta');
const email = require('../src/services/email');
const queue = require('../src/services/jobs');

let server; let base; let P; let Q; let root; let agent; let pkey; let qkey; let graph = []; let mails = [];
const hex = (s, b) => crypto.createHmac('sha256', s).update(b).digest('hex');
const SECRET = 'app-secret-meta-9999';
const wait = async () => { await queue.idle(); await new Promise((r) => setTimeout(r, 30)); await queue.idle(); };

before(async () => {
  ({ server, base } = await start());
  P = new Client(base); Q = new Client(base); root = new Client(base);
  await P.register('Moda Pi', 'pi@test.com'); await Q.register('Moda Rho', 'rho3@test.com'); await root.login('root@lc.test', 'SuperSecreta123');
  const me = (await P.get('/api/auth/me')).body.company; pkey = me.public_key; qkey = (await Q.get('/api/auth/me')).body.company.public_key;
  await root.req('PATCH', `/api/admin/companies/${me.id}`, { planCode: 'enterprise' });
  agent = (await P.post('/api/agents', { name: 'Pia', type: 'attention', status: 'active' })).body.agent;
  await P.post('/api/documents/text', { title: 'Horarios', content: 'Nuestro horario de atención es de lunes a viernes de 9 a 18 horas en el local.' });
  meta.setTransport(async (url, opts) => {
    graph.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers.authorization });
    if (/\?fields=name/.test(url)) return { status: 200, headers: {}, body: Buffer.from(JSON.stringify({ name: 'Lucía Pérez' })) };
    return { status: 200, headers: {}, body: Buffer.from(JSON.stringify({ message_id: `m.out${graph.length}`, recipient_id: '1' })) };
  });
  email.setTransportFactory(() => ({ verify: async () => {}, sendMail: async (m) => { mails.push(m); return {}; } }));
});
after(async () => { server.close(); await db.close(); });

const ev = (acct, mid, from, text, extra = {}) => ({ object: 'page', entry: [{ id: acct, time: Date.now(), messaging: [{ sender: { id: from }, recipient: { id: acct }, timestamp: Date.now(), message: { mid, text, ...extra } }] }] });
const postMeta = (provider, body, key = pkey, secret = SECRET, sig) => { const raw = JSON.stringify(body); return fetch(`${base}/api/webhooks/${provider}/${key}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig ?? `sha256=${hex(secret, raw)}` }, body: raw }); };

for (const [provider, acct, sendPath, label] of [['instagram', '17841400000001', '17841400000001/messages', 'Instagram'], ['facebook', '100000000000042', 'me/messages', 'Facebook Messenger']]) {
  test(`${label}: configuración sin exponer secretos y cifrados`, async () => {
    assert.equal((await P.put(`/api/channels/${provider}/config`, { account_id: acct, agent_id: agent.id })).status, 400); // falta token y secret
    assert.equal((await P.put(`/api/channels/${provider}/config`, { account_id: 'abc', access_token: 'EAAG-token-secreto-1', app_secret: SECRET, agent_id: agent.id })).status, 400);
    const r = await P.put(`/api/channels/${provider}/config`, { account_id: acct, access_token: 'EAAG-token-secreto-1', app_secret: SECRET, verify_token: 'verify-token-xyz', agent_id: agent.id });
    assert.equal(r.status, 200, r.text); assert.ok(!r.text.includes('EAAG-token') && !r.text.includes(SECRET)); assert.match(r.body.webhook_url, new RegExp(`/api/webhooks/${provider}/${pkey}$`));
    assert.ok(!(await db.system((q) => q('SELECT secrets FROM integrations WHERE provider = $1', [provider])))[0].secrets.includes('EAAG-token'));
    assert.equal((await P.post(`/api/channels/${provider}/config/test`)).body.ok, true);
    assert.equal((await Q.get(`/api/channels/${provider}/config`)).body.configured, false);
    assert.equal((await P.get('/api/channels/otro/config')).status, 404);
  });

  test(`${label}: verificación, firma, mensaje → IA → respuesta, eco, duplicado, cuenta ajena`, async () => {
    const ok = await fetch(`${base}/api/webhooks/${provider}/${pkey}?hub.mode=subscribe&hub.verify_token=verify-token-xyz&hub.challenge=CH77`); assert.equal(await ok.text(), 'CH77');
    assert.equal((await fetch(`${base}/api/webhooks/${provider}/${pkey}?hub.mode=subscribe&hub.verify_token=mal&hub.challenge=X`)).status, 403);
    assert.equal((await postMeta(provider, ev(acct, 'mid.1', 'U1', 'hola'), pkey, SECRET, 'sha256=00')).status, 403);
    assert.equal((await postMeta(provider, ev(acct, 'mid.1', 'U1', 'hola'), pkey, 'otro')).status, 403);
    assert.equal((await postMeta(provider, ev(acct, 'mid.1', 'U1', 'hola'), qkey)).status, 404); // otra empresa: sin integración
    graph = [];
    assert.equal((await postMeta(provider, ev(acct, `mid.${provider}.2`, 'USER-77', '¿Cuál es el horario de atención?'))).status, 200); await wait();
    const out = graph.find((g) => g.url.endsWith('/messages') && g.method === 'POST');
    assert.ok(out, 'debe responder'); assert.ok(out.url.endsWith(sendPath)); assert.equal(out.body.recipient.id, 'USER-77'); assert.match(out.body.message.text, /lunes a viernes/); assert.equal(out.auth, 'Bearer EAAG-token-secreto-1');
    const conv = (await P.get('/api/conversations')).body.conversations.find((c) => c.channel === provider);
    assert.ok(conv); assert.equal(conv.contact_name, 'Lucía Pérez'); // nombre desde el perfil de Meta
    const cust = (await P.get('/api/customers?q=Luc')).body.customers.find((c) => c.source === provider); assert.ok(cust);
    // duplicado, eco propio, cuenta ajena y no-texto
    const n = graph.length;
    await postMeta(provider, ev(acct, `mid.${provider}.2`, 'USER-77', '¿Cuál es el horario de atención?')); await wait(); assert.equal(graph.length, n);
    await postMeta(provider, ev(acct, 'mid.echo', acct, 'eco', { is_echo: true })); await wait(); assert.equal(graph.length, n);
    await postMeta(provider, ev('999999999', 'mid.other', 'U9', 'hola de otra cuenta')); await wait(); assert.equal(graph.length, n);
    graph = []; await postMeta(provider, ev(acct, 'mid.img', 'USER-88', undefined, { attachments: [{ type: 'image' }] })); await wait();
    assert.match(graph.find((g) => g.body?.message)?.body.message.text, /solo puedo leer mensajes de texto/);
    // sigue la misma conversación y puede derivarse
    await postMeta(provider, ev(acct, `mid.${provider}.3`, 'USER-77', 'quiero hablar con una persona')); await wait();
    const convs = (await P.get('/api/conversations')).body.conversations.filter((c) => c.channel === provider && c.contact_name === 'Lucía Pérez');
    assert.equal(convs.length, 1); assert.equal(convs[0].status, 'needs_human');
  });

  test(`${label}: respuesta del operador y ventana de 24 h`, async () => {
    const conv = (await P.get('/api/conversations')).body.conversations.find((c) => c.channel === provider && c.contact_name === 'Lucía Pérez'); graph = [];
    const r = await P.post(`/api/conversations/${conv.id}/messages`, { content: 'Hola Lucía, te ayudo yo.' });
    assert.equal(r.body.delivery.delivered, true); assert.equal(graph.find((g) => g.body?.message).body.message.text, 'Hola Lucía, te ayudo yo.');
    await db.system((q) => q("UPDATE messages SET created_at = now() - interval '30 hours' WHERE role = 'customer' AND conversation_id = $1", [conv.id]));
    const late = await P.post(`/api/conversations/${conv.id}/messages`, { content: 'Tarde' }); assert.equal(late.body.delivery.delivered, false); assert.match(late.body.delivery.reason, /24 hs/);
  });
}

// ---------------- Email ----------------
const mailBody = (o = {}) => ({ FromFull: { Email: 'cliente@mail.com', Name: 'Cora Cliente' }, From: 'Cora Cliente <cliente@mail.com>', Subject: 'Consulta de horarios', TextBody: '¿Cuál es el horario de atención?\n\nGracias', MessageID: `<in-${Math.random()}@mail.com>`, Headers: [], ...o });
const basic = (secret) => `Basic ${Buffer.from(`lc:${secret}`).toString('base64')}`;
let inboundSecret;
const postMail = (body, headers, key = pkey) => fetch(`${base}/api/webhooks/email/${key}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('Email: configuración, secreto de entrada mostrado una sola vez y prueba SMTP', async () => {
  const bad = await P.put('/api/email/config', { from_email: 'ventas@modapi.com', from_name: 'Moda Pi', smtp_host: 'smtp host raro', smtp_port: 587, smtp_secure: false, smtp_user: '', agent_id: agent.id });
  assert.equal(bad.status, 400);
  const r = await P.put('/api/email/config', { from_email: 'ventas@modapi.com', from_name: 'Moda Pi', smtp_host: 'smtp.modapi.com', smtp_port: 587, smtp_secure: false, smtp_user: 'ventas', smtp_pass: 'clave-smtp-secreta', agent_id: agent.id });
  assert.equal(r.status, 200, r.text); inboundSecret = r.body.inbound_secret; assert.match(inboundSecret, /^eml_/); assert.ok(!r.text.includes('clave-smtp-secreta'));
  assert.equal((await P.get('/api/email/config')).body.inbound_secret, undefined);
  const again = await P.put('/api/email/config', { from_email: 'ventas@modapi.com', from_name: 'Moda Pi', smtp_host: 'smtp.modapi.com', smtp_port: 587, smtp_secure: false, smtp_user: 'ventas', agent_id: agent.id });
  assert.equal(again.body.inbound_secret, null); // no se vuelve a mostrar ni cambia
  assert.ok(!(await db.system((q) => q("SELECT secrets FROM integrations WHERE provider = 'email'")))[0].secrets.includes('clave-smtp'));
  assert.equal((await P.post('/api/email/config/test')).body.ok, true); assert.equal((await Q.get('/api/email/config')).body.configured, false);
});

test('Email: autenticación de la entrada (Basic y firma HMAC) y aislamiento', async () => {
  assert.equal((await postMail(mailBody(), {})).status, 403);
  assert.equal((await postMail(mailBody(), { authorization: basic('incorrecto') })).status, 403);
  assert.equal((await postMail(mailBody(), { 'x-lc-signature': 'sha256=00' })).status, 403);
  assert.equal((await postMail(mailBody(), { authorization: basic(inboundSecret) }, qkey)).status, 404); // otra empresa no tiene el canal
  mails = [];
  assert.equal((await postMail(mailBody({ MessageID: '<pm-1@mail.com>' }), { authorization: basic(inboundSecret) })).status, 200); await wait();
  assert.equal(mails.length, 1);
  const m = mails[0]; assert.equal(m.to, 'cliente@mail.com'); assert.equal(m.subject, 'Re: Consulta de horarios'); assert.match(m.text, /lunes a viernes/);
  assert.equal(m.inReplyTo, '<pm-1@mail.com>'); assert.equal(m.headers['Auto-Submitted'], 'auto-replied'); assert.equal(m.from.address, 'ventas@modapi.com');
  const generic = { from: 'otro@mail.com', name: 'Otro', subject: 'Horarios', text: '¿Cuál es el horario?', message_id: '<gen-1@mail.com>' }; const raw = JSON.stringify(generic);
  mails = [];
  const g = await fetch(`${base}/api/webhooks/email/${pkey}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lc-signature': `sha256=${hex(inboundSecret, raw)}` }, body: raw });
  assert.equal(g.status, 200); await wait(); assert.equal(mails.length, 1); assert.equal(mails[0].to, 'otro@mail.com');
  const cust = (await P.get('/api/customers?q=cliente@mail.com')).body.customers[0]; assert.equal(cust.email, 'cliente@mail.com'); assert.equal(cust.source, 'email');
  assert.ok((await P.get('/api/conversations')).body.conversations.some((c) => c.channel === 'email'));
});

test('Email: no responde a automáticos, a no-reply ni a sí mismo; deduplica; corta el texto citado', async () => {
  const send = async (b) => { mails = []; await postMail(b, { authorization: basic(inboundSecret) }); await wait(); return mails.length; };
  assert.equal(await send(mailBody({ MessageID: '<a1>', Headers: [{ Name: 'Auto-Submitted', Value: 'auto-replied' }] })), 0);
  assert.equal(await send(mailBody({ MessageID: '<a2>', Headers: [{ Name: 'Precedence', Value: 'bulk' }] })), 0);
  assert.equal(await send(mailBody({ MessageID: '<a3>', Headers: [{ Name: 'List-Id', Value: '<news.x.com>' }] })), 0);
  assert.equal(await send(mailBody({ MessageID: '<a4>', FromFull: { Email: 'no-reply@banco.com', Name: 'Banco' } })), 0);
  assert.equal(await send(mailBody({ MessageID: '<a5>', FromFull: { Email: 'ventas@modapi.com', Name: 'Yo' } })), 0); // bucle contra sí mismo
  assert.equal(await send(mailBody({ MessageID: '<dup-1>', FromFull: { Email: 'dup@mail.com' } })), 1);
  assert.equal(await send(mailBody({ MessageID: '<dup-1>', FromFull: { Email: 'dup@mail.com' } })), 0); // reentrega
  const quoted = '¿Cuál es el horario de atención?\n\nEl 3 nov 2026, ventas@modapi.com escribió:\n> Tenemos stock de todo\n> hasta el viernes';
  assert.equal(await send(mailBody({ MessageID: '<q1>', FromFull: { Email: 'quote@mail.com' }, TextBody: quoted })), 1);
  const stored = (await db.system((q) => q("SELECT content FROM messages WHERE role = 'customer' AND content LIKE '%quote%' OR content LIKE '%Consulta de horarios%' ORDER BY created_at DESC LIMIT 20"))).map((r) => r.content).join('|');
  assert.ok(!/Tenemos stock de todo/.test(stored));
  assert.equal(await send(mailBody({ MessageID: '<e1>', FromFull: { Email: 'vacio@mail.com' }, TextBody: '   ' })), 0);
});

test('Email: tope de respuestas por remitente (anti-bucle) y respuesta del operador', async () => {
  let sent = 0;
  for (let i = 0; i < 13; i += 1) { mails = []; await postMail(mailBody({ MessageID: `<loop-${i}>`, FromFull: { Email: 'loop@mail.com' }, TextBody: `pregunta ${i} sobre el horario` }), { authorization: basic(inboundSecret) }); await wait(); sent += mails.length; }
  assert.equal(sent, 10); // el 11º en adelante no se responde
  const conv = (await P.get('/api/conversations')).body.conversations.find((c) => c.channel === 'email' && c.contact_name === 'Cora Cliente'); mails = [];
  const r = await P.post(`/api/conversations/${conv.id}/messages`, { content: 'Hola Cora, soy Luis.' });
  assert.equal(r.body.delivery.delivered, true); assert.equal(mails[0].to, 'cliente@mail.com'); assert.match(mails[0].subject, /^Re: /); assert.equal(mails[0].headers['Auto-Submitted'], undefined); // las personas no llevan marca de auto-respuesta
});

test('Email: sin inyección de cabeceras en asunto y remitente', async () => {
  mails = [];
  await postMail(mailBody({ MessageID: '<inj-1>', FromFull: { Email: 'inj@mail.com', Name: 'Mal\r\nBcc: x@evil.com' }, Subject: 'Hola\r\nBcc: robo@evil.com' }), { authorization: basic(inboundSecret) }); await wait();
  assert.equal(mails.length, 1); assert.ok(!/[\r\n]/.test(mails[0].subject)); assert.ok(!/Bcc/i.test(Object.keys(mails[0].headers).join()) && !mails[0].bcc);
  assert.equal(mails[0].to, 'inj@mail.com');
  const bad = await postMail(mailBody({ MessageID: '<inj-2>', FromFull: { Email: 'a@b.com>\r\nBcc: z@z.com' } }), { authorization: basic(inboundSecret) }); assert.equal(bad.status, 200); await wait();
  assert.ok(mails.every((m) => !/evil|z@z/.test(JSON.stringify(m.to))));
});

test('Email: envío SMTP real (nodemailer) contra un servidor local, con asunto y cabeceras correctas', async () => {
  const got = [];
  const smtp = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onData(stream, session, cb) { const c = []; stream.on('data', (d) => c.push(d)); stream.on('end', () => { got.push(Buffer.concat(c).toString()); cb(); }); } });
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
  email.setTransportFactory(null);
  await P.put('/api/email/config', { from_email: 'ventas@modapi.com', from_name: 'Moda Pi', smtp_host: '127.0.0.1', smtp_port: smtp.server.address().port, smtp_secure: false, smtp_require_tls: false, smtp_user: '', agent_id: agent.id });
  assert.equal((await P.post('/api/email/config/test')).body.ok, true);
  await postMail(mailBody({ MessageID: '<smtp-1@mail.com>', FromFull: { Email: 'real@mail.com', Name: 'Real' }, Subject: 'Horarios de la tienda' }), { authorization: basic(inboundSecret) }); await wait();
  assert.equal(got.length, 1); const raw = got[0];
  assert.match(raw, /^From: "?Moda Pi"? <ventas@modapi\.com>/m); assert.match(raw, /^To: real@mail\.com/m); assert.match(raw, /^Subject: Re: Horarios de la tienda/m);
  assert.match(raw, /^In-Reply-To: <smtp-1@mail\.com>/m); assert.match(raw, /^Auto-Submitted: auto-replied/m); assert.match(raw, /lunes a viernes/);
  await new Promise((r) => smtp.close(r));
});
