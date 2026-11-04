'use strict';
// Webhooks ENTRANTES de proveedores (WhatsApp, Mercado Pago). Siempre verifican firma.
const express = require('express');
const crypto = require('crypto');
const db = require('../db/pool');
const rl = require('../middleware/rateLimit');
const { wrap } = require('../middleware/errors');
const { E } = require('../lib/httpError');
const { decryptJson, hmacHex } = require('../lib/crypto');
const { safeEqual } = require('../lib/tokens');
const whatsapp = require('../services/whatsapp');
const meta = require('../services/meta');
const email = require('../services/email');
const queue = require('../services/queue');

const router = express.Router();
router.use(rl.webhook);
const KEY_RE = /^lcb_[0-9a-f]{24}$/;

async function companyByKey(key) {
  if (!KEY_RE.test(key)) throw E.notFound();
  const [c] = await db.system((q) => q("SELECT c.id FROM companies c WHERE c.public_key = $1 AND c.status <> 'suspended'", [key]));
  if (!c) throw E.notFound();
  const integ = await whatsapp.getIntegration(c.id);
  if (!integ || integ.status !== 'active') throw E.notFound();
  return { companyId: c.id, integ };
}

// Verificación del endpoint (handshake de Meta)
router.get('/whatsapp/:key', wrap(async (req, res) => {
  const { integ } = await companyByKey(req.params.key);
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token && integ.secrets.verify_token && safeEqual(token, integ.secrets.verify_token)) return res.type('text/plain').send(String(challenge));
  throw E.forbidden('Token de verificación inválido');
}));

router.post('/whatsapp/:key', wrap(async (req, res) => {
  const { companyId, integ } = await companyByKey(req.params.key);
  const sig = String(req.get('x-hub-signature-256') || '');
  const secret = integ.secrets.app_secret;
  if (!secret || !req.rawBody) throw E.forbidden('Firma no verificable');
  const expected = `sha256=${hmacHex(secret, req.rawBody)}`;
  if (!safeEqual(sig, expected)) throw E.forbidden('Firma inválida');
  await require('../services/queue').enqueue('whatsapp.inbound', companyId, { body: req.body || {} }); // durable: se reintenta si falla
  res.sendStatus(200);
}));

// Mercado Pago (suscripciones de LC-AI BUSINESS). Verifica firma y consulta la API; no confía en el cuerpo.
router.post('/mercadopago', wrap(async (req, res) => {
  const billing = require('../services/billing');
  const dataId = req.query['data.id'] || req.body?.data?.id;
  if (!dataId || !billing.verifySignature(req.headers, dataId)) throw E.forbidden('Firma inválida');
  const type = req.body?.type || req.query.type;
  res.sendStatus(200);
  if (['subscription_preapproval', 'preapproval'].includes(type)) billing.syncPreapproval(dataId).catch((e) => require('../lib/logger').error('mp webhook', { err: e.message }));
}));

// ---- Instagram y Facebook Messenger (mismo formato de webhook de Meta) ----
async function metaCompany(key, provider) {
  if (!KEY_RE.test(key)) throw E.notFound();
  const [c] = await db.system((q) => q("SELECT id FROM companies WHERE public_key = $1 AND status <> 'suspended'", [key]));
  if (!c) throw E.notFound();
  const integ = await meta.getIntegration(c.id, provider);
  if (!integ || integ.status !== 'active') throw E.notFound();
  return { companyId: c.id, integ };
}
for (const provider of Object.keys(meta.PROVIDERS)) {
  router.get(`/${provider}/:key`, wrap(async (req, res) => {
    const { integ } = await metaCompany(req.params.key, provider);
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token && integ.secrets.verify_token && safeEqual(token, integ.secrets.verify_token)) return res.type('text/plain').send(String(challenge));
    throw E.forbidden('Token de verificación inválido');
  }));
  router.post(`/${provider}/:key`, wrap(async (req, res) => {
    const { companyId, integ } = await metaCompany(req.params.key, provider);
    const secret = integ.secrets.app_secret;
    if (!secret || !req.rawBody) throw E.forbidden('Firma no verificable');
    if (!safeEqual(String(req.get('x-hub-signature-256') || ''), `sha256=${hmacHex(secret, req.rawBody)}`)) throw E.forbidden('Firma inválida');
    await queue.enqueue('meta.inbound', companyId, { provider, body: req.body || {} });
    res.sendStatus(200);
  }));
}

// ---- Email entrante (Postmark o formato genérico). Auth: Basic (contraseña = secreto) o X-LC-Signature HMAC ----
router.post('/email/:key', wrap(async (req, res) => {
  if (!KEY_RE.test(req.params.key)) throw E.notFound();
  const [c] = await db.system((q) => q("SELECT id FROM companies WHERE public_key = $1 AND status <> 'suspended'", [req.params.key]));
  if (!c) throw E.notFound();
  const integ = await email.getIntegration(c.id);
  if (!integ || integ.status !== 'active') throw E.notFound();
  const secret = integ.secrets.inbound_secret; let ok = false;
  const basic = /^Basic (.+)$/.exec(req.get('authorization') || '');
  if (basic) { const pass = Buffer.from(basic[1], 'base64').toString('utf8').split(':').slice(1).join(':'); ok = !!secret && safeEqual(pass, secret); }
  const sig = req.get('x-lc-signature');
  if (!ok && sig && req.rawBody) ok = !!secret && safeEqual(sig, `sha256=${hmacHex(secret, req.rawBody)}`);
  if (!ok) throw E.forbidden('Autenticación inválida');
  await queue.enqueue('email.inbound', c.id, { mail: email.normalize(req.body || {}) }); // se guarda ya normalizado y acotado
  res.sendStatus(200);
}));

module.exports = router;
