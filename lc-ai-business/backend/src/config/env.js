'use strict';
// Única lectura de process.env de toda la aplicación.
require('dotenv').config();
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  if (isProd) throw new Error('JWT_SECRET (>= 32 caracteres) es obligatorio en producción');
  jwtSecret = crypto.randomBytes(48).toString('hex'); // efímero: las sesiones caen al reiniciar
  console.warn('[env] JWT_SECRET ausente: usando secreto efímero de desarrollo');
}

let encKey = process.env.ENCRYPTION_KEY;
if (!encKey || encKey.length < 32) {
  if (isProd) throw new Error('ENCRYPTION_KEY (>= 32 caracteres) es obligatoria en producción: cifra los secretos de integraciones');
  encKey = jwtSecret; // desarrollo: los secretos guardados dejan de ser legibles al reiniciar
}
const publicUrl = (process.env.PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, '');

module.exports = Object.freeze({
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT) || 4000,
  publicUrl,
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  databaseUrl: process.env.DATABASE_URL || 'postgres://lc_ai:lc_ai@localhost:5432/lc_ai_business',
  databaseSsl: bool(process.env.DATABASE_SSL),
  jwtSecret,
  encryptionKey: encKey,
  allowPrivateUrls: bool(process.env.ALLOW_PRIVATE_URLS) && !isProd, // solo desarrollo/tests
  cookieSecure: bool(process.env.COOKIE_SECURE, isProd),
  accessTtlSec: 15 * 60,
  refreshTtlSec: 7 * 24 * 3600,
  superAdmin: { email: process.env.SUPERADMIN_EMAIL || '', password: process.env.SUPERADMIN_PASSWORD || '' },
  mp: { accessToken: process.env.MP_ACCESS_TOKEN || '', webhookSecret: process.env.MP_WEBHOOK_SECRET || '' },
  ai: {
    provider: process.env.AI_PROVIDER || 'mock',
    anthropic: { key: process.env.ANTHROPIC_API_KEY || '', model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5' },
    openai: { key: process.env.OPENAI_API_KEY || '', model: process.env.OPENAI_MODEL || 'gpt-4o-mini' },
  },
  frontendDir: process.env.FRONTEND_DIR || require('path').join(__dirname, '..', '..', '..', 'frontend'),
});
