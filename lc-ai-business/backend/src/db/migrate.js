'use strict';
const fs = require('fs');
const path = require('path');
const { pool, close } = require('./pool');
const log = require('../lib/logger');

async function migrate() {
  const dir = path.join(__dirname, 'migrations');
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      log.info('migración aplicada', { f });
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`Migración ${f} falló: ${e.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { migrate };
if (require.main === module) {
  migrate().then(() => close()).catch((e) => { console.error(e.message); process.exit(1); });
}
