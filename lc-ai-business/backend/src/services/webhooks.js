'use strict';
// Webhooks salientes firmados (HMAC-SHA256) hacia sistemas del cliente / ecosistema LC.
const crypto = require('crypto');
const db = require('../db/pool');
const { safeFetch } = require('../lib/ssrf');
const { decrypt, hmacHex } = require('../lib/crypto');
const log = require('../lib/logger');

const EVENTS = ['conversation.handoff', 'lead.created', 'quote.requested', 'order.created', 'stock.low', 'customer.created'];

/** Encola una entrega por endpoint suscripto (con reintentos). */
async function dispatch(companyId, event, data) {
  if (!EVENTS.includes(event)) return;
  const eps = await db.tenant(companyId, (q) => q('SELECT id FROM webhook_endpoints WHERE enabled AND $1 = ANY(events)', [event]));
  const body = (id) => JSON.stringify({ id, event, created_at: new Date().toISOString(), data }); // id estable entre reintentos: el receptor puede deduplicar
  for (const ep of eps) await require('./queue').enqueue('webhook.deliver', companyId, { endpointId: ep.id, event, body: body(crypto.randomUUID()) }, { maxAttempts: 6 });
}

/** Handler del job: un intento de entrega. Reintenta ante 5xx/429/red; 4xx y destinos bloqueados no se reintentan. */
async function deliver({ endpointId, event, body }, job) {
  const companyId = job.company_id;
  const [ep] = await db.tenant(companyId, (q) => q('SELECT * FROM webhook_endpoints WHERE id = $1', [endpointId]));
  if (!ep || !ep.enabled) return; // se borró o pausó mientras esperaba
  const ts = String(Math.floor(Date.now() / 1000)); // marca de tiempo fresca en cada intento
  let status = null; let error = ''; let retry = false;
  try {
    const sig = hmacHex(decrypt(ep.secret_enc), `${ts}.${body}`);
    const r = await safeFetch(ep.url, { method: 'POST', timeoutMs: 5000, maxBytes: 64 * 1024, headers: { 'content-type': 'application/json', 'user-agent': 'LC-AI-BUSINESS-Webhook/1.0', 'x-lc-event': event, 'x-lc-timestamp': ts, 'x-lc-signature': `sha256=${sig}` }, body });
    status = r.status; if (r.status >= 400) { error = `HTTP ${r.status}`; retry = r.status >= 500 || r.status === 429; }
  } catch (e) { error = String(e.message).slice(0, 200); retry = !e.status; } // e.status: destino inválido/bloqueado → permanente
  try { await db.tenant(companyId, (q) => q('INSERT INTO webhook_events (company_id, endpoint_id, event, payload, status_code, error) VALUES ($1,$2,$3,$4,$5,$6)', [companyId, ep.id, event, body, status, error])); }
  catch (e) { log.error('webhook log failed', { err: e.message }); }
  if (retry) throw new Error(error || 'entrega fallida');
}

module.exports = { dispatch, deliver, EVENTS };
