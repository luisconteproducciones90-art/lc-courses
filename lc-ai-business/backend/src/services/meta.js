'use strict';
// Instagram (mensajes directos) y Facebook Messenger con las APIs OFICIALES de Meta (Graph API).
// Ambos usan el mismo formato de webhook (entry[].messaging[]) y la misma API de envío.
const db = require('../db/pool');
const { decryptJson } = require('../lib/crypto');
const { safeFetch } = require('../lib/ssrf');
const log = require('../lib/logger');
const domain = require('./domain');

const GRAPH = 'https://graph.facebook.com/v20.0';
const PROVIDERS = {
  instagram: { label: 'Instagram', sendPath: (cfg) => `${cfg.account_id}/messages`, idField: 'ID de cuenta de Instagram' },
  facebook: { label: 'Facebook Messenger', sendPath: () => 'me/messages', idField: 'ID de la página de Facebook' },
};
let transport = (url, opts) => safeFetch(url, opts); // inyectable en tests
const setTransport = (f) => { transport = f; };

async function getIntegration(companyId, provider) {
  const [row] = await db.tenant(companyId, (q) => q('SELECT * FROM integrations WHERE provider = $1', [provider]));
  return row ? { ...row, secrets: decryptJson(row.secrets) } : null;
}

async function graph(integ, path, method, payload) {
  const r = await transport(`${GRAPH}/${path}`, { method, headers: { authorization: `Bearer ${integ.secrets.access_token}`, 'content-type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined, timeoutMs: 10000 });
  let json = {}; try { json = JSON.parse(r.body.toString('utf8')); } catch { /* sin cuerpo */ }
  if (r.status >= 400) { const e = new Error(json?.error?.message || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return json;
}

async function sendText(integ, recipientId, text) {
  const j = await graph(integ, PROVIDERS[integ.provider].sendPath(integ.config), 'POST', { recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text: String(text).slice(0, 1000) } });
  return j.message_id || null;
}
const verifyCredentials = (integ) => graph(integ, `${integ.provider === 'facebook' ? 'me' : integ.config.account_id}?fields=name`, 'GET');

async function profileName(integ, psid) { // mejor esfuerzo: el nombre mejora el CRM, pero no es imprescindible
  try { const j = await graph(integ, `${psid}?fields=name`, 'GET'); return String(j.name || '').slice(0, 120); } catch { return ''; }
}

/** Mensajes entrantes de un webhook de Meta (lo invoca la cola; si lanza, se reintenta). */
async function processBody(companyId, provider, body) {
  const integ = await getIntegration(companyId, provider);
  if (!integ || integ.status !== 'active') return;
  const orchestrator = require('../ai/orchestrator');
  const label = PROVIDERS[provider].label;
  for (const entry of body.entry || []) {
    if (String(entry.id) !== String(integ.config.account_id)) continue; // evento de otra cuenta: no es de esta empresa
    for (const ev of entry.messaging || []) {
      const m = ev.message;
      const from = String(ev.sender?.id || '');
      if (!m || m.is_echo || !m.mid || !from || from === String(integ.config.account_id)) continue; // ecos de nuestros propios envíos, recibos, postbacks
      const dup = await db.tenant(companyId, (q) => q('SELECT 1 FROM messages WHERE external_id = $1', [m.mid]));
      if (dup.length) continue; // Meta reintenta entregas: idempotencia
      if (!m.text) { await sendText(integ, from, 'Por ahora solo puedo leer mensajes de texto. ¿Podés escribirme tu consulta?').catch(() => {}); continue; }
      const name = await profileName(integ, from);
      const prep = await db.tenant(companyId, async (q) => {
        const { customer, created } = await domain.upsertCustomer(q, companyId, { name, externalRef: `${provider}:${from}`, source: provider });
        const [conv] = await q("SELECT id FROM conversations WHERE channel = $1 AND external_contact = $2 AND status <> 'closed' ORDER BY last_message_at DESC LIMIT 1", [provider, from]);
        return { customer, created, conversationId: conv?.id || null };
      });
      if (prep.created) await require('./events').emit(companyId, 'customer.created', { customerId: prep.customer.id });
      const out = await orchestrator.handleCustomerMessage({ companyId, agentId: integ.agent_id, conversationId: prep.conversationId, channel: provider, message: m.text.slice(0, 2000), contactId: from, customerId: prep.customer.id,
        contactName: name || `${label} ${from.slice(-4)}`, externalContact: from, externalId: m.mid, requireActive: true, maxTokens: 500 });
      for (const t of [out.reply, ...(out.automationReplies || [])].filter(Boolean)) {
        const id = await sendText(integ, from, t).catch((e) => { log.error(`${provider} send failed`, { err: e.message }); return null; });
        if (id) await db.tenant(companyId, (q) => q("UPDATE messages SET external_id = $2 WHERE id = (SELECT id FROM messages WHERE conversation_id = $1 AND role = 'ai' AND content = $3 AND external_id IS NULL ORDER BY created_at DESC LIMIT 1)", [out.conversationId, id, t])).catch(() => {});
      }
    }
  }
}

/** Respuesta manual de un operador (ventana de 24 h de Meta). */
async function sendOperatorReply(companyId, conv, text) {
  const integ = await getIntegration(companyId, conv.channel);
  if (!integ || integ.status !== 'active') return { delivered: false, reason: `${PROVIDERS[conv.channel].label} no está activo` };
  const [last] = await db.tenant(companyId, (q) => q("SELECT max(created_at) AS t FROM messages WHERE conversation_id = $1 AND role = 'customer'", [conv.id]));
  if (!last?.t || Date.now() - new Date(last.t).getTime() > 24 * 3600 * 1000) return { delivered: false, reason: 'Pasaron más de 24 hs desde el último mensaje del cliente: Meta no permite responderle desde acá.' };
  try { return { delivered: true, id: await sendText(integ, conv.external_contact, text) }; } catch { return { delivered: false, reason: `${PROVIDERS[conv.channel].label} rechazó el envío` }; }
}

module.exports = { PROVIDERS, getIntegration, sendText, verifyCredentials, processBody, sendOperatorReply, setTransport };
