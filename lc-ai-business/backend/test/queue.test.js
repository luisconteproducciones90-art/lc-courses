'use strict';
process.env.ALLOW_PRIVATE_URLS = '1';
process.env.ENCRYPTION_KEY = 'test-encryption-key-test-encryption-key-1234';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { start, Client, db } = require('./helpers');
const queue = require('../src/services/jobs');

let server; let base; let J; let root; let cid; let recv; let url; let replies = []; let hits = [];
const due = () => db.system((q) => q("UPDATE jobs SET run_at = now() WHERE status = 'queued'")); // adelanta el reloj de los reintentos
const jobs = (kind) => db.system((q) => q('SELECT status, attempts, last_error FROM jobs WHERE kind = $1 ORDER BY created_at DESC', [kind]));
async function lowStock(sku) { // dispara stock.low por la API pública
  const k = await J.post('/api/integrations/api-keys', { name: 'k-' + sku, scopes: ['products:write'] });
  await J.post('/api/products', { name: 'Prod ' + sku, sku, price: 1, stock: 10, stock_min: 2 });
  await fetch(`${base}/api/v1/products/${sku}/stock`, { method: 'PATCH', headers: { authorization: `Bearer ${k.body.secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ stock: 1 }) });
  await queue.idle();
}

before(async () => {
  ({ server, base } = await start());
  J = new Client(base); root = new Client(base);
  await J.register('Tienda Iota', 'iota@test.com'); await root.login('root@lc.test', 'SuperSecreta123');
  cid = (await J.get('/api/auth/me')).body.company.id;
  recv = http.createServer((req, res) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => { hits.push({ headers: req.headers, body: Buffer.concat(c).toString() }); res.statusCode = replies.shift() ?? 200; res.end('x'); }); });
  await new Promise((r) => recv.listen(0, '127.0.0.1', r)); url = `http://127.0.0.1:${recv.address().port}/hook`;
});
after(async () => { server.close(); recv.close(); await db.close(); });

test('webhook saliente: reintenta con 5xx, conserva el id del evento y termina bien', async () => {
  await J.post('/api/integrations/webhooks', { url, events: ['stock.low'] });
  replies = [500, 503]; hits = [];
  await lowStock('Q-1');
  assert.equal(hits.length, 1);
  let j = (await jobs('webhook.deliver'))[0]; assert.equal(j.status, 'queued'); assert.equal(j.attempts, 1); assert.match(j.last_error, /500/);
  await due(); await queue.runDue(); assert.equal(hits.length, 2);
  await due(); await queue.runDue(); assert.equal(hits.length, 3);
  j = (await jobs('webhook.deliver'))[0]; assert.equal(j.status, 'done'); assert.equal(j.attempts, 3);
  const ids = new Set(hits.map((h) => JSON.parse(h.body).id)); assert.equal(ids.size, 1); // el receptor puede deduplicar
  assert.ok(hits.every((h) => /^sha256=[0-9a-f]{64}$/.test(h.headers['x-lc-signature'])));
  const log = (await J.get('/api/integrations/webhooks/events')).body.events; assert.equal(log.filter((e) => e.event === 'stock.low').length, 3);
});

test('4xx no se reintenta; el agotamiento de intentos queda en "failed" visible para SUPER ADMIN', async () => {
  replies = [400]; hits = [];
  await lowStock('Q-2');
  let j = (await jobs('webhook.deliver'))[0]; assert.equal(j.status, 'done'); assert.equal(hits.length, 1); assert.equal(j.attempts, 1);
  replies = new Array(20).fill(500); hits = [];
  await lowStock('Q-3');
  for (let i = 0; i < 6; i += 1) { await due(); await queue.runDue(); }
  j = (await jobs('webhook.deliver'))[0]; assert.equal(j.status, 'failed'); assert.equal(j.attempts, 6); assert.equal(hits.length, 6);
  const st = (await root.get('/api/admin/jobs')).body; assert.ok(st.counts.failed >= 1); assert.equal(st.failed[0].kind, 'webhook.deliver');
  assert.equal((await J.get('/api/admin/jobs')).status, 403);
});

test('trabajos huérfanos de un proceso caído se recuperan y los de un endpoint borrado se descartan', async () => {
  let runs = 0; let failTimes = 2;
  queue.register('test.flaky', async () => { runs += 1; if (failTimes-- > 0) throw new Error('falla transitoria'); });
  const id = await queue.enqueue('test.flaky', null, { x: 1 }); await queue.idle();
  let j = (await db.system((q) => q('SELECT status, attempts FROM jobs WHERE id = $1', [id])))[0]; assert.equal(j.status, 'queued'); assert.equal(j.attempts, 1);
  // el proceso "murió" a mitad de un intento: quedó running hace 10 minutos
  await db.system((q) => q("UPDATE jobs SET status = 'running', locked_at = now() - interval '10 minutes', run_at = now() WHERE id = $1", [id]));
  await queue.runDue(); await due(); await queue.runDue();
  j = (await db.system((q) => q('SELECT status, attempts FROM jobs WHERE id = $1', [id])))[0]; assert.equal(j.status, 'done'); assert.equal(runs, 3);
  // endpoint eliminado mientras el evento esperaba
  replies = [500]; hits = [];
  const w = (await J.get('/api/integrations')).body.webhooks[0];
  await lowStock('Q-4');
  await J.del(`/api/integrations/webhooks/${w.id}`); await due(); await queue.runDue();
  assert.equal((await jobs('webhook.deliver'))[0].status, 'done'); assert.equal(hits.length, 1);
});
