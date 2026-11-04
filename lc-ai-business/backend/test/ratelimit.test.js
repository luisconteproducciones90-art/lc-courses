'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { buildLimiter, closeRedis, waitRedis } = require('../src/middleware/rateLimit');

const servers = [];
const REDIS = process.env.TEST_REDIS_URL; // ej: redis://127.0.0.1:6390
const serve = async (limiter) => { const app = express(); app.set('trust proxy', true); app.get('/x', limiter, (req, res) => res.json({ ok: true })); const s = http.createServer(app); await new Promise((r) => s.listen(0, '127.0.0.1', r)); servers.push(s); return s; };
const hit = async (s, ip = '1.1.1.1') => (await fetch(`http://127.0.0.1:${s.address().port}/x`, { headers: { 'x-forwarded-for': ip } })).status;
after(async () => { servers.forEach((s) => { s.closeAllConnections?.(); s.close(); }); await closeRedis(); });

test('sin Redis: límite por proceso', async () => {
  const s = await serve(buildLimiter({ name: 'mem', windowMs: 60000, max: 3, message: 'x', redisUrl: '', ignoreTest: true }));
  assert.deepEqual([await hit(s), await hit(s), await hit(s), await hit(s)], [200, 200, 200, 429]);
  assert.equal(await hit(s, '2.2.2.2'), 200); s.close();
});

test('Redis caído: falla abierta, la app sigue respondiendo', async () => {
  const s = await serve(buildLimiter({ name: 'down', windowMs: 60000, max: 1, message: 'x', redisUrl: 'redis://127.0.0.1:1', ignoreTest: true }));
  for (let i = 0; i < 3; i += 1) assert.equal(await hit(s), 200);
  s.close();
});

test('con Redis: dos instancias de la app comparten el mismo contador', { skip: !REDIS && 'definí TEST_REDIS_URL para probar Redis' }, async () => {
  const name = `shared-${Date.now()}`;
  const opts = { name, windowMs: 60000, max: 4, message: 'x', redisUrl: REDIS, ignoreTest: true };
  const a = await serve(buildLimiter(opts)); const b = await serve(buildLimiter(opts)); // "dos servidores"
  assert.equal(await waitRedis(REDIS), true);
  assert.deepEqual([await hit(a), await hit(b), await hit(a), await hit(b)], [200, 200, 200, 200]);
  assert.equal(await hit(a), 429); assert.equal(await hit(b), 429); // el quinto, en cualquiera de las dos, es rechazado
  assert.equal(await hit(b, '9.9.9.9'), 200); a.close(); b.close();
});
