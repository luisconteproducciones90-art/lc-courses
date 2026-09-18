require('dotenv').config();
const { readFileSync } = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function runMigrations() {
  const sql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    console.log('🔄 Ejecutando migraciones...');
    await client.query(sql);
    console.log('✅ Migraciones completadas.');
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
