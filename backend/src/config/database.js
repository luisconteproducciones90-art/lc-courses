const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }  // Railway / Render requieren esto
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err);
});

async function connectDB() {
  const client = await pool.connect();
  const { rows } = await client.query('SELECT NOW()');
  client.release();
  console.log(`✅ PostgreSQL conectado: ${rows[0].now}`);
  return pool;
}

// Helper: ejecutar query con parámetros
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('[SQL]', { text: text.slice(0, 80), duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
}

// Helper: transacción
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, connectDB, query, transaction };
