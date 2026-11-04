'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://lc_ai:lc_ai@localhost:5432/lc_ai_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.AI_PROVIDER = 'mock';
const http = require('http');
const db = require('../src/db/pool');
const { createApp } = require('../src/app');
const { seedAll } = require('../src/db/seed');

async function resetDb() {
  await db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;').catch(async () => {
    // el rol no es dueño del schema: limpiar tablas
    await db.pool.query("DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$");
  });
}

async function start() {
  await resetDb();
  if (process.env.TEST_SUPERUSER_URL) { // opcional: habilita pgvector (requiere superusuario) para probar ese camino
    const { Client: PgClient } = require('pg'); const c = new PgClient({ connectionString: process.env.TEST_SUPERUSER_URL }); await c.connect(); await c.query('CREATE EXTENSION IF NOT EXISTS vector'); await c.end();
  }
  await seedAll({ superAdminEmail: 'root@lc.test', superAdminPassword: 'SuperSecreta123' });
  const server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

// Cliente con cookie jar + CSRF
class Client {
  constructor(base) { this.base = base; this.jar = {}; }
  cookieHeader() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(method, path, body, opts = {}) {
    const headers = { cookie: this.cookieHeader(), ...(opts.headers || {}) };
    if (this.jar.lc_csrf && !opts.noCsrf) headers['x-csrf-token'] = this.jar.lc_csrf;
    let payload;
    if (body instanceof FormData) payload = body; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(this.base + path, { method, headers, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i); const v = kv.slice(i + 1);
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) delete this.jar[k]; else this.jar[k] = v;
    }
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, body: json, text, headers: res.headers };
  }
  get(p) { return this.req('GET', p); }
  post(p, b, o) { return this.req('POST', p, b ?? {}, o); }
  put(p, b) { return this.req('PUT', p, b); }
  del(p) { return this.req('DELETE', p); }
  async csrf() { await this.get('/api/auth/csrf'); return this; }
  async login(email, password) { await this.csrf(); const r = await this.post('/api/auth/login', { email, password }); if (r.status !== 200) throw new Error(`login ${r.status} ${r.text}`); return r; }
  async register(name, email) {
    await this.csrf();
    const r = await this.post('/api/auth/register', { companyName: name, name: 'Admin ' + name, email, password: 'ClaveSegura123' });
    if (r.status !== 201) throw new Error(`register ${r.status} ${r.text}`);
    return r;
  }
}
module.exports = { start, Client, db };
