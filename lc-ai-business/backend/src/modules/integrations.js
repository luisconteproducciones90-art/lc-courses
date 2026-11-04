'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../db/pool');
const env = require('../config/env');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { audit } = require('../lib/audit');
const { sha256, randomToken } = require('../lib/tokens');
const { encrypt, encryptJson } = require('../lib/crypto');
const { validateUrl } = require('../lib/ssrf');
const { EVENTS } = require('../services/webhooks');
const connectors = require('../services/connectors');

const router = express.Router();
router.use(authenticate);
const SCOPES = ['products:read', 'products:write', 'stock:read', 'customers:read', 'customers:write', 'orders:read', 'orders:write', 'conversations:read'];

const PLANNED = [['google', 'Google (Calendar, Business Profile)'], ['mercadopago-merchant', 'Mercado Pago del comercio (cobros a clientes)']];

router.get('/', requirePerm('integrations:read'), wrap(async (req, res) => {
  const out = await db.tenant(req.user.companyId, async (q) => {
    const [c] = await q('SELECT public_key, widget FROM companies WHERE id = $1', [req.user.companyId]);
    const integs = await q('SELECT id, provider, name, status, config, created_at FROM integrations');
    return {
      widget: { ...c.widget, public_key: c.public_key, snippet: `<script src="${env.publicUrl}/lc-ai-widget.js" data-company="${c.public_key}" async></script>` },
      whatsapp: integs.find((i) => i.provider === 'whatsapp')?.status || 'disabled',
      channels: Object.fromEntries(['instagram', 'facebook', 'email'].map((k) => [k, integs.find((i) => i.provider === k)?.status || 'disabled'])),
      connectors: integs.filter((i) => i.provider.startsWith('rest:')).map((i) => ({ id: i.id, name: i.name, status: i.status, preset: i.config.preset, base_url: i.config.base_url, last_sync_at: i.config.last_sync_at || null, last_error: i.config.last_error || '', last_result: i.config.last_result || null, auto_sync: i.config.auto_sync === 'true' || i.config.auto_sync === true })),
      api_keys: await q('SELECT id, name, prefix, scopes, last_used_at, revoked_at, created_at FROM api_keys ORDER BY created_at DESC'),
      webhooks: await q('SELECT id, url, events, enabled, created_at FROM webhook_endpoints ORDER BY created_at DESC'),
    };
  });
  res.json({ ...out, presets: Object.entries(connectors.PRESETS).map(([k, v]) => ({ key: k, label: v.label })), scopes: SCOPES, events: EVENTS, planned: PLANNED.map(([key, label]) => ({ key, label })) });
}));

// ----- Widget -----
router.put('/widget', requirePerm('integrations:write'), wrap(async (req, res) => {
  const b = parse(z.object({ enabled: z.boolean(), position: z.enum(['left', 'right']), title: str(60), agent_id: id.nullable(), allowed_origins: z.array(z.string().trim().max(200).refine((o) => { try { return new URL(o).origin === o; } catch { return false; } }, 'Origen inválido (ej: https://mitienda.com)')).max(20) }).partial(), req.body);
  await db.tenant(req.user.companyId, async (q) => {
    if (b.agent_id) { const [a] = await q('SELECT id FROM agents WHERE id = $1', [b.agent_id]); if (!a) throw E.notFound('Agente no encontrado'); }
    await q('UPDATE companies SET widget = widget || $2::jsonb WHERE id = $1', [req.user.companyId, JSON.stringify(b)]);
  });
  await audit(req, 'widget.update', 'company', req.user.companyId);
  res.json({ ok: true });
}));

// ----- API keys -----
router.post('/api-keys', requirePerm('integrations:write'), wrap(async (req, res) => {
  const b = parse(z.object({ name: str(80, 2), scopes: z.array(z.enum(SCOPES)).min(1) }), req.body);
  const key = `lcb_sk_${randomToken(30)}`;
  const [k] = await db.tenant(req.user.companyId, (q) => q('INSERT INTO api_keys (company_id, name, prefix, key_hash, scopes, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, prefix, scopes, created_at',
    [req.user.companyId, b.name, key.slice(0, 14), sha256(key), b.scopes, req.user.id]));
  await audit(req, 'apikey.create', 'api_key', k.id, { scopes: b.scopes });
  res.status(201).json({ api_key: k, secret: key, notice: 'Guardala ahora: no se vuelve a mostrar.' });
}));
router.delete('/api-keys/:id', requirePerm('integrations:write'), wrap(async (req, res) => {
  const r = await db.tenant(req.user.companyId, (q) => q('UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id', [parse(id, req.params.id)]));
  if (!r.length) throw E.notFound('Clave no encontrada');
  await audit(req, 'apikey.revoke', 'api_key', req.params.id); res.json({ ok: true });
}));

// ----- Webhooks salientes -----
router.post('/webhooks', requirePerm('integrations:write'), wrap(async (req, res) => {
  const b = parse(z.object({ url: z.string().trim().url().max(500), events: z.array(z.enum(EVENTS)).min(1) }), req.body);
  validateUrl(b.url);
  if (env.isProd && !b.url.startsWith('https://')) throw E.badRequest('En producción el webhook debe usar https');
  const secret = `whsec_${randomToken(24)}`;
  const [w] = await db.tenant(req.user.companyId, (q) => q('INSERT INTO webhook_endpoints (company_id, url, secret_enc, events) VALUES ($1,$2,$3,$4) RETURNING id, url, events, enabled', [req.user.companyId, b.url, encrypt(secret), b.events]));
  await audit(req, 'webhook.create', 'webhook', w.id);
  res.status(201).json({ webhook: w, secret, notice: 'Usá este secreto para verificar la firma X-LC-Signature (HMAC-SHA256 de "timestamp.body"). No se vuelve a mostrar.' });
}));
router.put('/webhooks/:id', requirePerm('integrations:write'), wrap(async (req, res) => {
  const b = parse(z.object({ enabled: z.boolean() }), req.body);
  const r = await db.tenant(req.user.companyId, (q) => q('UPDATE webhook_endpoints SET enabled = $2 WHERE id = $1 RETURNING id', [parse(id, req.params.id), b.enabled]));
  if (!r.length) throw E.notFound(); res.json({ ok: true });
}));
router.delete('/webhooks/:id', requirePerm('integrations:write'), wrap(async (req, res) => {
  const r = await db.tenant(req.user.companyId, (q) => q('DELETE FROM webhook_endpoints WHERE id = $1 RETURNING id', [parse(id, req.params.id)]));
  if (!r.length) throw E.notFound(); res.json({ ok: true });
}));
router.get('/webhooks/events', requirePerm('integrations:read'), wrap(async (req, res) => {
  res.json({ events: await db.tenant(req.user.companyId, (q) => q('SELECT e.id, e.event, e.status_code, e.error, e.created_at, w.url FROM webhook_events e LEFT JOIN webhook_endpoints w ON w.id = e.endpoint_id ORDER BY e.created_at DESC LIMIT 50')) });
}));

// ----- Conectores REST (LC-SYSTEM BUSINESS, LC-ECOMMERCE, LC-PEDIDOS, API externa) -----
const connSchema = z.object({
  preset: z.enum(Object.keys(connectors.PRESETS)), name: str(80, 2), base_url: z.string().trim().url().max(300), products_path: str(200), items_path: str(100),
  auth_type: z.enum(['bearer', 'header', 'none']), auth_header: str(60), token: z.string().max(500).optional(), auto_sync: z.boolean(), paginate: z.boolean(),
  field_map: z.partialRecord(z.enum(connectors.FIELDS), str(100)),
}).partial();
const connKey = (name) => `rest:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;

router.post('/connectors', requirePerm('integrations:write'), wrap(async (req, res) => {
  const b = parse(connSchema.required({ name: true, base_url: true }), req.body);
  validateUrl(b.base_url);
  const { token, name, ...cfg } = b;
  const [i] = await db.tenant(req.user.companyId, (q) => q(`INSERT INTO integrations (company_id, provider, name, status, config, secrets) VALUES ($1,$2,$3,'active',$4,$5) RETURNING id, name, status`,
    [req.user.companyId, connKey(name), name, JSON.stringify({ products_path: connectors.PRESETS[b.preset || 'custom'].products_path, auth_type: 'bearer', ...cfg }), encryptJson({ token: token || '' })]));
  await audit(req, 'connector.create', 'integration', i.id);
  res.status(201).json({ connector: i });
}));
router.post('/connectors/:id/sync', requirePerm('integrations:write'), wrap(async (req, res) => {
  try { res.json({ ok: true, result: await connectors.runSync(req.user.companyId, parse(id, req.params.id)) }); }
  catch (e) { if (e.status) throw e; res.status(200).json({ ok: false, error: e.message }); }
}));
router.delete('/connectors/:id', requirePerm('integrations:write'), wrap(async (req, res) => {
  const r = await db.tenant(req.user.companyId, (q) => q("DELETE FROM integrations WHERE id = $1 AND provider LIKE 'rest:%' RETURNING id", [parse(id, req.params.id)]));
  if (!r.length) throw E.notFound(); res.json({ ok: true });
}));

module.exports = router;
