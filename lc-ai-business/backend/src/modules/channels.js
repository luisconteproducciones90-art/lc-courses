'use strict';
// Configuración de canales: Instagram, Facebook Messenger (Meta) y Email.
const express = require('express');
const crypto = require('crypto');
const db = require('../db/pool');
const env = require('../config/env');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { audit } = require('../lib/audit');
const { encryptJson } = require('../lib/crypto');
const meta = require('../services/meta');
const email = require('../services/email');

const social = express.Router({ mergeParams: true });
const mail = express.Router();
social.use(authenticate); mail.use(authenticate);
const pk = async (cid) => (await db.tenant(cid, (q) => q('SELECT public_key FROM companies WHERE id = $1', [cid])))[0].public_key;

// ---------- Instagram / Facebook ----------
const providerOf = (req) => { const p = req.params.provider; if (!meta.PROVIDERS[p]) throw E.notFound('Canal no encontrado'); return p; };
const socialView = (integ, provider, key) => ({ provider, label: meta.PROVIDERS[provider].label, idField: meta.PROVIDERS[provider].idField, configured: !!integ, status: integ?.status || 'disabled', account_id: integ?.config?.account_id || '', agent_id: integ?.agent_id || null,
  has_access_token: !!integ?.secrets?.access_token, has_app_secret: !!integ?.secrets?.app_secret, verify_token: integ?.secrets?.verify_token || '', webhook_url: `${env.publicUrl}/api/webhooks/${provider}/${key}` });

social.get('/:provider/config', requirePerm('integrations:read'), wrap(async (req, res) => {
  const p = providerOf(req); res.json(socialView(await meta.getIntegration(req.user.companyId, p), p, await pk(req.user.companyId)));
}));
social.put('/:provider/config', requirePerm('integrations:write'), wrap(async (req, res) => {
  const p = providerOf(req);
  const b = parse(z.object({ account_id: z.string().regex(/^\d{5,25}$/, 'ID inválido (solo dígitos)'), access_token: z.string().min(10).max(1000).optional(), app_secret: z.string().min(8).max(200).optional(), verify_token: z.string().min(8).max(100).optional(), agent_id: id, enabled: z.boolean().default(true) }), req.body);
  const cur = await meta.getIntegration(req.user.companyId, p);
  const secrets = { ...(cur?.secrets || {}), ...(b.access_token ? { access_token: b.access_token } : {}), ...(b.app_secret ? { app_secret: b.app_secret } : {}) };
  secrets.verify_token = b.verify_token || secrets.verify_token || crypto.randomBytes(16).toString('hex');
  if (b.enabled && (!secrets.access_token || !secrets.app_secret)) throw E.badRequest('Para activar el canal se necesitan el token de acceso y el app secret');
  await db.tenant(req.user.companyId, async (q) => {
    const [a] = await q('SELECT id FROM agents WHERE id = $1', [b.agent_id]); if (!a) throw E.notFound('Agente no encontrado');
    await q(`INSERT INTO integrations (company_id, provider, name, status, config, secrets, agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (company_id, provider) DO UPDATE SET status = EXCLUDED.status, config = EXCLUDED.config, secrets = EXCLUDED.secrets, agent_id = EXCLUDED.agent_id`,
    [req.user.companyId, p, meta.PROVIDERS[p].label, b.enabled ? 'active' : 'disabled', JSON.stringify({ account_id: b.account_id }), encryptJson(secrets), b.agent_id]);
  });
  await audit(req, `${p}.config`, 'integration', p, { enabled: b.enabled });
  res.json(socialView(await meta.getIntegration(req.user.companyId, p), p, await pk(req.user.companyId)));
}));
social.post('/:provider/config/test', requirePerm('integrations:write'), wrap(async (req, res) => {
  const p = providerOf(req); const integ = await meta.getIntegration(req.user.companyId, p);
  if (!integ) throw E.badRequest('Configurá el canal primero');
  try { const r = await meta.verifyCredentials(integ); res.json({ ok: true, name: r.name || '' }); } catch { res.json({ ok: false, error: 'Meta rechazó las credenciales (token o ID inválidos)' }); }
}));

// ---------- Email ----------
const mailView = (integ, key) => ({ configured: !!integ, status: integ?.status || 'disabled', agent_id: integ?.agent_id || null, from_email: integ?.config?.from_email || '', from_name: integ?.config?.from_name || '', smtp_host: integ?.config?.smtp_host || '',
  smtp_port: integ?.config?.smtp_port || 587, smtp_secure: !!integ?.config?.smtp_secure, smtp_user: integ?.config?.smtp_user || '', has_smtp_pass: !!integ?.secrets?.smtp_pass, has_inbound_secret: !!integ?.secrets?.inbound_secret,
  inbound_url: `${env.publicUrl}/api/webhooks/email/${key}` });

mail.get('/config', requirePerm('integrations:read'), wrap(async (req, res) => { res.json(mailView(await email.getIntegration(req.user.companyId), await pk(req.user.companyId))); }));
mail.put('/config', requirePerm('integrations:write'), wrap(async (req, res) => {
  const b = parse(z.object({ from_email: z.string().trim().toLowerCase().email().max(200), from_name: str(80), smtp_host: z.string().trim().min(3).max(200).regex(/^[A-Za-z0-9.-]+$/, 'Host inválido'), smtp_port: z.number().int().min(1).max(65535), smtp_secure: z.boolean(), smtp_require_tls: z.boolean().default(true), smtp_user: str(200), smtp_pass: z.string().max(500).optional(), agent_id: id, enabled: z.boolean().default(true), regenerate_secret: z.boolean().default(false) }), req.body);
  const cur = await email.getIntegration(req.user.companyId);
  const secrets = { ...(cur?.secrets || {}), ...(b.smtp_pass ? { smtp_pass: b.smtp_pass } : {}) };
  let shown = null;
  if (!secrets.inbound_secret || b.regenerate_secret) { secrets.inbound_secret = `eml_${crypto.randomBytes(24).toString('base64url')}`; shown = secrets.inbound_secret; }
  await db.tenant(req.user.companyId, async (q) => {
    const [a] = await q('SELECT id FROM agents WHERE id = $1', [b.agent_id]); if (!a) throw E.notFound('Agente no encontrado');
    await q(`INSERT INTO integrations (company_id, provider, name, status, config, secrets, agent_id) VALUES ($1,'email','Email',$2,$3,$4,$5)
      ON CONFLICT (company_id, provider) DO UPDATE SET status = EXCLUDED.status, config = EXCLUDED.config, secrets = EXCLUDED.secrets, agent_id = EXCLUDED.agent_id`,
    [req.user.companyId, b.enabled ? 'active' : 'disabled', JSON.stringify({ from_email: b.from_email, from_name: b.from_name, smtp_host: b.smtp_host, smtp_port: b.smtp_port, smtp_secure: b.smtp_secure, smtp_require_tls: b.smtp_require_tls, smtp_user: b.smtp_user }), encryptJson(secrets), b.agent_id]);
  });
  await audit(req, 'email.config', 'integration', 'email', { enabled: b.enabled });
  res.json({ ...mailView(await email.getIntegration(req.user.companyId), await pk(req.user.companyId)), inbound_secret: shown, notice: shown ? 'Guardá este secreto en tu proveedor de correo entrante: no se vuelve a mostrar.' : undefined });
}));
mail.post('/config/test', requirePerm('integrations:write'), wrap(async (req, res) => {
  const integ = await email.getIntegration(req.user.companyId); if (!integ) throw E.badRequest('Configurá el correo primero');
  try { await email.verify(integ); res.json({ ok: true }); } catch (e) { res.json({ ok: false, error: 'No se pudo conectar al servidor SMTP con esos datos' }); }
}));

module.exports = { social, mail };
