'use strict';
// WhatsApp Business Cloud API (API OFICIAL de Meta). Sin scraping ni métodos no oficiales.
const db = require('../db/pool');
const { decryptJson } = require('../lib/crypto');
const { safeFetch } = require('../lib/ssrf');
const log = require('../lib/logger');
const domain = require('./domain');

const GRAPH = 'https://graph.facebook.com/v20.0';
let transport = async (url, opts) => safeFetch(url, opts); // inyectable en tests
const setTransport = (fn) => { transport = fn; };
const pending = new Set();
const idle = () => Promise.all([...pending]);

async function getIntegration(companyId) {
  const [row] = await db.tenant(companyId, (q) => q("SELECT * FROM integrations WHERE provider = 'whatsapp'"));
  if (!row) return null;
  return { ...row, secrets: decryptJson(row.secrets) };
}

async function graph(integ, path, method, payload) {
  const r = await transport(`${GRAPH}/${path}`, { method, headers: { authorization: `Bearer ${integ.secrets.access_token}`, 'content-type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined, timeoutMs: 10000 });
  let json = {}; try { json = JSON.parse(r.body.toString('utf8')); } catch { /* sin cuerpo */ }
  if (r.status >= 400) { const err = new Error(json?.error?.message || `HTTP ${r.status}`); err.status = r.status; throw err; }
  return json;
}

async function sendText(integ, to, text) {
  const j = await graph(integ, `${integ.config.phone_number_id}/messages`, 'POST', { messaging_product: 'whatsapp', to, type: 'text', text: { body: String(text).slice(0, 4000), preview_url: false } });
  return j.messages?.[0]?.id || null;
}
async function sendTemplate(integ, to, name, language, variables = []) {
  const components = variables.length ? [{ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: String(v).slice(0, 200) })) }] : [];
  const j = await graph(integ, `${integ.config.phone_number_id}/messages`, 'POST', { messaging_product: 'whatsapp', to, type: 'template', template: { name, language: { code: language }, components } });
  return j.messages?.[0]?.id || null;
}
const verifyCredentials = (integ) => graph(integ, `${integ.config.phone_number_id}?fields=display_phone_number,verified_name`, 'GET');

/** Mensajes entrantes de un cambio de webhook. Corre en segundo plano; Meta recibe 200 de inmediato. */
async function processChange(companyId, integ, value) {
  const orchestrator = require('../ai/orchestrator');
  for (const st of value.statuses || []) { // entregado / leído / fallido
    await db.tenant(companyId, (q) => q("UPDATE messages SET meta = meta || $2::jsonb WHERE external_id = $1", [st.id, JSON.stringify({ wa_status: st.status })])).catch(() => {});
  }
  for (const m of value.messages || []) {
    const from = String(m.from || '').replace(/\D/g, '').slice(0, 20);
    if (!from || !m.id) continue;
    const name = value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name || '';
    const dup = await db.tenant(companyId, (q) => q('SELECT 1 FROM messages WHERE external_id = $1', [m.id]));
    if (dup.length) continue; // Meta reintenta entregas: idempotencia
    const text = m.type === 'text' ? m.text?.body : null;
    if (!text) { await sendText(integ, from, 'Por ahora solo puedo leer mensajes de texto. ¿Podés escribirme tu consulta?').catch(() => {}); continue; }
    try {
      const prep = await db.tenant(companyId, async (q) => {
        const { customer, created } = await domain.upsertCustomer(q, companyId, { name, whatsapp: from, source: 'whatsapp' });
        const [conv] = await q("SELECT id FROM conversations WHERE channel = 'whatsapp' AND external_contact = $1 AND status <> 'closed' ORDER BY last_message_at DESC LIMIT 1", [from]);
        return { customer, created, conversationId: conv?.id || null };
      });
      if (prep.created) await require('./events').emit(companyId, 'customer.created', { customerId: prep.customer.id });
      const out = await orchestrator.handleCustomerMessage({
        companyId, agentId: integ.agent_id, conversationId: prep.conversationId, channel: 'whatsapp', message: text.slice(0, 2000), contactId: from, customerId: prep.customer.id,
        contactName: name || from, externalContact: from, externalId: m.id, ignoreSchedule: false, requireActive: true, maxTokens: 500,
      });
      const outbound = [out.reply, ...(out.automationReplies || [])].filter(Boolean);
      for (const t of outbound) {
        const wid = await sendText(integ, from, t).catch((e) => { log.error('whatsapp send failed', { err: e.message }); return null; });
        if (wid) await db.tenant(companyId, (q) => q("UPDATE messages SET external_id = $2 WHERE id = (SELECT id FROM messages WHERE conversation_id = $1 AND role = 'ai' AND content = $3 AND external_id IS NULL ORDER BY created_at DESC LIMIT 1)", [out.conversationId, wid, t])).catch(() => {});
      }
    } catch (e) { log.error('whatsapp message failed', { err: e.message }); }
  }
}

function handleWebhookAsync(companyId, integ, body) {
  const p = (async () => {
    for (const entry of body.entry || []) for (const ch of entry.changes || []) if (ch.field === 'messages' && ch.value) await processChange(companyId, integ, ch.value);
  })().catch((e) => log.error('whatsapp webhook', { err: e.message })).finally(() => pending.delete(p));
  pending.add(p);
  return p;
}

/** Respuesta manual de un operador a una conversación de WhatsApp (respeta la ventana de 24 h). */
async function sendOperatorReply(companyId, conv, text) {
  const integ = await getIntegration(companyId);
  if (!integ || integ.status !== 'active') return { delivered: false, reason: 'WhatsApp no está activo' };
  const [last] = await db.tenant(companyId, (q) => q("SELECT max(created_at) AS t FROM messages WHERE conversation_id = $1 AND role = 'customer'", [conv.id]));
  if (!last?.t || Date.now() - new Date(last.t).getTime() > 24 * 3600 * 1000) return { delivered: false, reason: 'Pasaron más de 24 hs desde el último mensaje del cliente: enviá una plantilla aprobada.' };
  try { const id = await sendText(integ, conv.external_contact, text); return { delivered: true, id }; } catch (e) { return { delivered: false, reason: 'WhatsApp rechazó el envío' }; }
}

module.exports = { getIntegration, sendText, sendTemplate, verifyCredentials, handleWebhookAsync, sendOperatorReply, setTransport, idle };
