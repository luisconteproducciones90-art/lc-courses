'use strict';
// Canal Email. Salida: SMTP (nodemailer) con el servidor de la empresa. Entrada: webhook de correo entrante
// (Postmark, o un reenviador propio con el formato genérico) autenticado con secreto compartido.
// Incluye defensas contra bucles de auto-respuesta (cabeceras RFC 3834, remitentes no-reply, tope por remitente).
const crypto = require('crypto');
const dns = require('dns').promises;
const nodemailer = require('nodemailer');
const db = require('../db/pool');
const env = require('../config/env');
const { decryptJson } = require('../lib/crypto');
const { isPrivateIp } = require('../lib/ssrf');
const { clean } = require('../lib/text');
const log = require('../lib/logger');
const domain = require('./domain');

const MAX_AI_REPLIES_PER_HOUR = 10;
const oneLine = (s, n = 200) => String(s ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim().slice(0, n); // evita inyección de cabeceras
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
let mailTransportFactory = null; // inyectable en tests
const setTransportFactory = (f) => { mailTransportFactory = f; };

async function getIntegration(companyId) {
  const [row] = await db.tenant(companyId, (q) => q("SELECT * FROM integrations WHERE provider = 'email'"));
  return row ? { ...row, secrets: decryptJson(row.secrets) } : null;
}

/** El host SMTP lo carga la empresa: se resuelve y se rechazan destinos internos (SSRF), conectando a la IP validada. */
async function transporter(integ) {
  if (mailTransportFactory) return mailTransportFactory(integ);
  const c = integ.config;
  const addrs = await dns.lookup(c.smtp_host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Servidor SMTP no permitido');
  return nodemailer.createTransport({
    host: addrs[0].address, port: Number(c.smtp_port) || 587, secure: !!c.smtp_secure, requireTLS: !c.smtp_secure && c.smtp_require_tls !== false,
    auth: c.smtp_user ? { user: c.smtp_user, pass: integ.secrets.smtp_pass || '' } : undefined, tls: { servername: c.smtp_host },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  });
}

async function verify(integ) { const t = await transporter(integ); await t.verify(); }

async function sendMail(integ, { to, subject, text, inReplyTo, references, auto = true }) {
  if (!EMAIL_RE.test(to)) throw new Error('Destinatario inválido');
  const t = await transporter(integ);
  const fromEmail = oneLine(integ.config.from_email);
  const messageId = `<${crypto.randomUUID()}@${fromEmail.split('@')[1] || 'lc-ai.local'}>`;
  await t.sendMail({
    from: { name: oneLine(integ.config.from_name, 80), address: fromEmail }, to, subject: oneLine(subject, 200), text: String(text).slice(0, 20000), messageId,
    ...(inReplyTo ? { inReplyTo: oneLine(inReplyTo), references: oneLine(references || inReplyTo, 500) } : {}),
    headers: auto ? { 'Auto-Submitted': 'auto-replied', 'X-Auto-Response-Suppress': 'All' } : {}, // evita bucles con otros autoresponders
  });
  return messageId;
}

// ----- Entrada -----
const hdrMap = (h) => (Array.isArray(h) ? Object.fromEntries(h.map((x) => [String(x.Name || x.name).toLowerCase(), String(x.Value ?? x.value)])) : Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k.toLowerCase(), String(v)])));
function cutQuoted(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n'); const out = [];
  for (const l of lines) { if (/^\s*>/.test(l) || /^(El .{5,120} escribi[óo]:|On .{5,120} wrote:|-{2,}\s*(Original Message|Mensaje original)\s*-{2,})/i.test(l.trim())) break; out.push(l); }
  return out.join('\n').trim();
}
/** Normaliza Postmark inbound o el formato genérico {from, name, subject, text, message_id, headers}. */
function normalize(b) {
  const fromObj = b.FromFull || (typeof b.from === 'object' ? b.from : null);
  const email = oneLine(fromObj?.Email || fromObj?.email || (typeof b.from === 'string' ? b.from : b.From) || '').toLowerCase().replace(/^.*<([^>]+)>.*$/, '$1');
  const text = cutQuoted(b.StrippedTextReply || b.TextBody || b.text || '') || cutQuoted(b.TextBody || b.text || '');
  return { email, name: oneLine(fromObj?.Name || fromObj?.name || b.name || '', 120), subject: oneLine(b.Subject || b.subject || '(sin asunto)', 200), text: clean(text, 4000),
    messageId: oneLine(b.MessageID || b.message_id || b['message-id'] || '', 300), headers: hdrMap(b.Headers || b.headers) };
}
function isAutomated(n, ownEmail) {
  const h = n.headers;
  if (h['auto-submitted'] && h['auto-submitted'].toLowerCase() !== 'no') return true;
  if (/^(bulk|list|junk|auto_reply)$/i.test(h.precedence || '')) return true;
  if (h['x-autoreply'] || h['x-autorespond'] || h['list-id'] || h['x-auto-response-suppress']) return true;
  if (/^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce|notifications?)@/i.test(n.email)) return true;
  return !!ownEmail && n.email === String(ownEmail).toLowerCase();
}

async function processInbound(companyId, n) {
  const integ = await getIntegration(companyId);
  if (!integ || integ.status !== 'active') return { skipped: 'inactivo' };
  if (!EMAIL_RE.test(n.email) || !n.text) return { skipped: 'sin remitente o texto' };
  if (isAutomated(n, integ.config.from_email)) return { skipped: 'automático' };
  if (n.messageId) { const dup = await db.tenant(companyId, (q) => q('SELECT 1 FROM messages WHERE external_id = $1', [n.messageId])); if (dup.length) return { skipped: 'duplicado' }; }
  const recent = await db.tenant(companyId, (q) => q("SELECT count(*)::int n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.channel = 'email' AND c.external_contact = $1 AND m.role = 'ai' AND m.created_at > now() - interval '1 hour'", [n.email]));
  if (recent[0].n >= MAX_AI_REPLIES_PER_HOUR) { log.warn('email: tope por remitente (posible bucle)', { companyId }); return { skipped: 'tope' }; }
  const orchestrator = require('../ai/orchestrator');
  const prep = await db.tenant(companyId, async (q) => {
    const { customer, created } = await domain.upsertCustomer(q, companyId, { name: n.name, email: n.email, externalRef: `email:${n.email}`, source: 'email' });
    const [conv] = await q("SELECT id FROM conversations WHERE channel = 'email' AND external_contact = $1 AND status <> 'closed' ORDER BY last_message_at DESC LIMIT 1", [n.email]);
    return { customer, created, conversationId: conv?.id || null };
  });
  if (prep.created) await require('./events').emit(companyId, 'customer.created', { customerId: prep.customer.id });
  const out = await orchestrator.handleCustomerMessage({ companyId, agentId: integ.agent_id, conversationId: prep.conversationId, channel: 'email', message: `Asunto: ${n.subject}\n\n${n.text}`.slice(0, 2000), contactId: n.email,
    customerId: prep.customer.id, contactName: n.name || n.email, externalContact: n.email, externalId: n.messageId || null, requireActive: true, maxTokens: 700 });
  await db.tenant(companyId, (q) => q("UPDATE messages SET meta = meta || $2::jsonb WHERE conversation_id = $1 AND role = 'customer' AND created_at = (SELECT max(created_at) FROM messages WHERE conversation_id = $1 AND role = 'customer')", [out.conversationId, JSON.stringify({ subject: n.subject, message_id: n.messageId })]));
  const subject = /^re:/i.test(n.subject) ? n.subject : `Re: ${n.subject}`;
  for (const t of [out.reply, ...(out.automationReplies || [])].filter(Boolean)) {
    try {
      const id = await sendMail(integ, { to: n.email, subject, text: t, inReplyTo: n.messageId || undefined });
      await db.tenant(companyId, (q) => q("UPDATE messages SET external_id = $2 WHERE id = (SELECT id FROM messages WHERE conversation_id = $1 AND role = 'ai' AND content = $3 AND external_id IS NULL ORDER BY created_at DESC LIMIT 1)", [out.conversationId, id, t]));
    } catch (e) { log.error('email send failed', { err: e.message }); }
  }
  return { replied: true };
}

/** Respuesta manual de un operador por correo (sin ventana de tiempo). */
async function sendOperatorReply(companyId, conv, text) {
  const integ = await getIntegration(companyId);
  if (!integ || integ.status !== 'active') return { delivered: false, reason: 'Email no está activo' };
  const [last] = await db.tenant(companyId, (q) => q("SELECT meta FROM messages WHERE conversation_id = $1 AND role = 'customer' ORDER BY created_at DESC LIMIT 1", [conv.id]));
  const subject = oneLine(last?.meta?.subject || 'Tu consulta');
  try { return { delivered: true, id: await sendMail(integ, { to: conv.external_contact, subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`, text, inReplyTo: last?.meta?.message_id || undefined, auto: false }) }; }
  catch { return { delivered: false, reason: 'El servidor SMTP rechazó el envío' }; }
}

module.exports = { getIntegration, sendMail, verify, normalize, isAutomated, processInbound, sendOperatorReply, setTransportFactory, cutQuoted, EMAIL_RE };
