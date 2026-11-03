'use strict';
const { Pool } = require('pg');
const env = require('../config/env');
const log = require('../lib/logger');

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
});
pool.on('error', (e) => log.error('pg pool error', { err: e.message }));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ejecuta fn dentro de UNA transacción con el contexto de RLS fijado.
 * fn recibe q(sql, params) => rows[].
 * Mantener estas transacciones cortas: NO llamar a proveedores de IA dentro.
 */
async function run(ctx, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.company_id', $1, true), set_config('app.system', $2, true)", [
      ctx.companyId || '',
      ctx.system ? 'on' : 'off',
    ]);
    const q = async (text, params) => (await client.query(text, params)).rows;
    const result = await fn(q, client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw e;
  } finally {
    client.release();
  }
}

/** Contexto de UNA empresa: RLS solo deja ver/escribir filas de ese company_id. */
function tenant(companyId, fn) {
  if (typeof companyId !== 'string' || !UUID_RE.test(companyId)) throw new Error('tenant(): companyId inválido');
  return run({ companyId }, fn);
}

/** Contexto de sistema (login, panel SUPER ADMIN, tareas globales). Usar con criterio. */
function system(fn) {
  return run({ system: true }, fn);
}

/** Verifica que el rol de BD no se saltee RLS. */
async function checkRole() {
  const { rows } = await pool.query('SELECT rolsuper, rolbypassrls, current_user AS u FROM pg_roles WHERE rolname = current_user');
  const r = rows[0];
  const bypass = r && (r.rolsuper || r.rolbypassrls);
  if (bypass) {
    const msg = `El rol de BD "${r.u}" es superusuario/BYPASSRLS: la separación de tenants por RLS NO está garantizada`;
    if (env.isProd) throw new Error(msg);
    log.warn(msg);
  }
  return !bypass;
}

module.exports = { pool, tenant, system, checkRole, UUID_RE, close: () => pool.end() };
