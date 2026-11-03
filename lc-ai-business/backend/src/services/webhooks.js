'use strict';
// Webhooks salientes firmados (HMAC-SHA256) hacia sistemas del cliente / ecosistema LC.
const crypto = require('crypto');
const db = require('../db/pool');
const { safeFetch } = require('../lib/ssrf');
const { decrypt, hmacHex } = require('../lib/crypto');
const log = require('../lib/logger');

const EVENTS = ['conversation.handoff', 'lead.created', 'quote.requested', 'order.created', 'stock.low', 'customer.created'];

async function dispatch(companyId, event, data) {
  if (!EVENTS.includes(event)) return;
  const eps = await db.tenant(companyId, (q) => q('SELECT * FROM webhook_endpoints WHERE enabled AND $1 = ANY(events)', [event]));
  await Promise.all(eps.map(async (ep) => {
    const body = JSON.stringify({ id: crypto.randomUUID(), event, created_at: new Date().toISOString(), data });
    const ts = String(Math.floor(Date.now() / 1000));
    let status = null; let error = '';
    try {
      const sig = hmacHex(decrypt(ep.secret_enc), `${ts}.${body}`);
      const r = await safeFetch(ep.url, { method: 'POST', timeoutMs: 5000, maxBytes: 64 * 1024, headers: { 'content-type': 'application/json', 'user-agent': 'LC-AI-BUSINESS-Webhook/1.0', 'x-lc-event': event, 'x-lc-timestamp': ts, 'x-lc-signature': `sha256=${sig}` }, body });
      status = r.status; if (r.status >= 400) error = `HTTP ${r.status}`;
    } catch (e) { error = String(e.message).slice(0, 200); }
    try { await db.tenant(companyId, (q) => q('INSERT INTO webhook_events (company_id, endpoint_id, event, payload, status_code, error) VALUES ($1,$2,$3,$4,$5,$6)', [companyId, ep.id, event, body, status, error])); }
    catch (e) { log.error('webhook log failed', { err: e.message }); }
  }));
}
module.exports = { dispatch, EVENTS };
