'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { clean } = require('../lib/text');
const { E, HttpError } = require('../lib/httpError');
const { audit } = require('../lib/audit');
const { encryptJson } = require('../lib/crypto');
const env = require('../config/env');
const wa = require('../services/whatsapp');

const router = express.Router();
router.use(authenticate);

const view = (integ, publicKey) => ({
  configured: !!integ, status: integ?.status || 'disabled', phone_number_id: integ?.config?.phone_number_id || '', agent_id: integ?.agent_id || null,
  has_access_token: !!integ?.secrets?.access_token, has_app_secret: !!integ?.secrets?.app_secret, verify_token: integ?.secrets?.verify_token || '',
  webhook_url: `${env.publicUrl}/api/webhooks/whatsapp/${publicKey}`, last_error: integ?.config?.last_error || '',
});

router.get('/config', requirePerm('integrations:read'), wrap(async (req, res) => {
  const [c] = await db.tenant(req.user.companyId, (q) => q('SELECT public_key FROM companies WHERE id = $1', [req.user.companyId]));
  res.json(view(await wa.getIntegration(req.user.companyId), c.public_key));
}));

router.put('/config', requirePerm('integrations:write'), wrap(async (req, res) => {
  const b = parse(z.object({ phone_number_id: z.string().regex(/^\d{5,25}$/, 'ID de número inválido'), access_token: z.string().min(10).max(1000).optional(), app_secret: z.string().min(8).max(200).optional(), verify_token: z.string().min(8).max(100).optional(), agent_id: id, enabled: z.boolean().default(true) }), req.body);
  const cur = await wa.getIntegration(req.user.companyId);
  const secrets = { ...(cur?.secrets || {}), ...(b.access_token ? { access_token: b.access_token } : {}), ...(b.app_secret ? { app_secret: b.app_secret } : {}) };
  secrets.verify_token = b.verify_token || secrets.verify_token || crypto.randomBytes(16).toString('hex');
  if (b.enabled && (!secrets.access_token || !secrets.app_secret)) throw E.badRequest('Para activar WhatsApp se necesitan el token de acceso y el app secret');
  await db.tenant(req.user.companyId, async (q) => {
    const [a] = await q('SELECT id FROM agents WHERE id = $1', [b.agent_id]); if (!a) throw E.notFound('Agente no encontrado');
    await q(`INSERT INTO integrations (company_id, provider, name, status, config, secrets, agent_id) VALUES ($1,'whatsapp','WhatsApp Business',$2,$3,$4,$5)
      ON CONFLICT (company_id, provider) DO UPDATE SET status = EXCLUDED.status, config = EXCLUDED.config, secrets = EXCLUDED.secrets, agent_id = EXCLUDED.agent_id`,
    [req.user.companyId, b.enabled ? 'active' : 'disabled', JSON.stringify({ phone_number_id: b.phone_number_id }), encryptJson(secrets), b.agent_id]);
  });
  await audit(req, 'whatsapp.config', 'integration', 'whatsapp', { enabled: b.enabled });
  const [c] = await db.tenant(req.user.companyId, (q) => q('SELECT public_key FROM companies WHERE id = $1', [req.user.companyId]));
  res.json(view(await wa.getIntegration(req.user.companyId), c.public_key));
}));

router.post('/config/test', requirePerm('integrations:write'), wrap(async (req, res) => {
  const integ = await wa.getIntegration(req.user.companyId);
  if (!integ) throw E.badRequest('Configurá WhatsApp primero');
  try { const r = await wa.verifyCredentials(integ); res.json({ ok: true, number: r.display_phone_number || '', name: r.verified_name || '' }); }
  catch (e) { res.status(200).json({ ok: false, error: 'Meta rechazó las credenciales (token o ID de número inválidos)' }); }
}));

// Plantillas (registro local de las aprobadas en Meta)
router.get('/templates', requirePerm('integrations:read'), wrap(async (req, res) => {
  res.json({ templates: await db.tenant(req.user.companyId, (q) => q('SELECT * FROM whatsapp_templates ORDER BY name')) });
}));
router.post('/templates', requirePerm('integrations:write'), wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().regex(/^[a-z0-9_]{1,80}$/, 'Solo minúsculas, números y _'), language: str(10, 2).default('es'), body: str(1024, 1) }), req.body);
  const [t] = await db.tenant(req.user.companyId, (q) => q('INSERT INTO whatsapp_templates (company_id, name, language, body) VALUES ($1,$2,$3,$4) RETURNING *', [req.user.companyId, b.name, b.language, clean(b.body, 1024)]));
  res.status(201).json({ template: t });
}));
router.delete('/templates/:id', requirePerm('integrations:write'), wrap(async (req, res) => {
  const r = await db.tenant(req.user.companyId, (q) => q('DELETE FROM whatsapp_templates WHERE id = $1 RETURNING id', [parse(id, req.params.id)]));
  if (!r.length) throw E.notFound(); res.json({ ok: true });
}));
router.post('/send-template', requirePerm('conversations:reply'), wrap(async (req, res) => {
  const b = parse(z.object({ to: z.string().regex(/^\d{8,20}$/, 'Número con código de país, solo dígitos'), template: str(80, 1), language: str(10).default('es'), variables: z.array(str(200)).max(10).default([]) }), req.body);
  const integ = await wa.getIntegration(req.user.companyId);
  if (!integ || integ.status !== 'active') throw E.badRequest('WhatsApp no está activo');
  const [t] = await db.tenant(req.user.companyId, (q) => q('SELECT id FROM whatsapp_templates WHERE name = $1 AND language = $2', [b.template, b.language]));
  if (!t) throw E.notFound('Plantilla no registrada');
  try { const wid = await wa.sendTemplate(integ, b.to, b.template, b.language, b.variables); await audit(req, 'whatsapp.template_sent', 'template', b.template); res.json({ ok: true, id: wid }); }
  catch { throw new HttpError(502, 'whatsapp_error', 'WhatsApp rechazó el envío'); }
}));

module.exports = router;
