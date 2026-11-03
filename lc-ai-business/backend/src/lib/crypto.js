'use strict';
// Cifrado de secretos en reposo (tokens de WhatsApp, secretos de webhooks): AES-256-GCM.
const crypto = require('crypto');
const env = require('../config/env');

const key = () => crypto.createHash('sha256').update(`lc-ai-business:${env.encryptionKey}`).digest();

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}
function decrypt(blob) {
  if (!blob) return '';
  const [v, iv, tag, data] = String(blob).split('.');
  if (v !== 'v1') throw new Error('formato de secreto desconocido');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}
const encryptJson = (o) => encrypt(JSON.stringify(o || {}));
const decryptJson = (b) => { try { return b ? JSON.parse(decrypt(b)) : {}; } catch { return {}; } };
const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

module.exports = { encrypt, decrypt, encryptJson, decryptJson, hmacHex };
