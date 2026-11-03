'use strict';
// Suscripciones. Proveedor de cobro abstracto: Mercado Pago (preapproval) o registro manual (transferencia).
// Sin precios definitivos: un plan con price_cents NULL no se puede contratar online (se solicita a LC-SYSTEM).
const db = require('../db/pool');
const env = require('../config/env');
const { safeFetch } = require('../lib/ssrf');
const { hmacHex } = require('../lib/crypto');
const { safeEqual } = require('../lib/tokens');
const { E } = require('../lib/httpError');
const log = require('../lib/logger');

const MP = 'https://api.mercadopago.com';
let transport = (url, opts) => safeFetch(url, opts);
const setTransport = (f) => { transport = f; };
const mpEnabled = () => !!env.mp.accessToken;

async function mp(path, method = 'GET', body) {
  const r = await transport(`${MP}${path}`, { method, headers: { authorization: `Bearer ${env.mp.accessToken}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, timeoutMs: 15000 });
  let j = {}; try { j = JSON.parse(r.body.toString('utf8')); } catch { /* vacío */ }
  if (r.status >= 400) throw new Error(`Mercado Pago respondió ${r.status}`);
  return j;
}

/** Crea la suscripción en Mercado Pago y devuelve la URL de pago. La plan activa recién cuando llega el webhook. */
async function startCheckout({ companyId, payerEmail, plan }) {
  if (plan.price_cents == null) throw E.conflict('Este plan todavía no tiene precio definido. Solicitá el cambio y LC-SYSTEM te contacta.');
  if (!mpEnabled()) throw E.conflict('El cobro online no está configurado en este servidor. Solicitá el cambio de plan a LC-SYSTEM.');
  const amount = plan.price_cents / 100;
  const sub = await mp('/preapproval', 'POST', {
    reason: `LC-AI BUSINESS · plan ${plan.name}`, external_reference: `${companyId}:${plan.code}`, payer_email: payerEmail,
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: amount, currency_id: plan.currency || 'ARS' },
    back_url: `${env.publicUrl}/billing`, status: 'pending',
  });
  await db.tenant(companyId, (q) => q("INSERT INTO invoices (company_id, plan_id, amount, currency, status, provider, provider_ref, description) VALUES ($1,$2,$3,$4,'pending','mercadopago',$5,$6) ON CONFLICT DO NOTHING",
    [companyId, plan.id, amount, plan.currency || 'ARS', String(sub.id), `Suscripción plan ${plan.name}`]));
  return { url: sub.init_point, provider_ref: String(sub.id) };
}

/** Verifica la firma de Mercado Pago (header x-signature: ts=…,v1=…). */
function verifySignature(headers, dataId) {
  if (!env.mp.webhookSecret) return false;
  const parts = Object.fromEntries(String(headers['x-signature'] || '').split(',').map((p) => p.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${headers['x-request-id'] || ''};ts:${parts.ts};`;
  return safeEqual(parts.v1, hmacHex(env.mp.webhookSecret, manifest));
}

/** Aplica el estado de una suscripción de MP al sistema (consultando la API, no confiando en el cuerpo del webhook). */
async function syncPreapproval(preapprovalId) {
  const pre = await mp(`/preapproval/${encodeURIComponent(preapprovalId)}`);
  const [companyId, planCode] = String(pre.external_reference || '').split(':');
  if (!companyId || !planCode) return { ignored: true };
  const [c] = await db.system((q) => q('SELECT id FROM companies WHERE id::text = $1', [companyId]));
  const [plan] = await db.system((q) => q('SELECT * FROM plans WHERE code = $1', [planCode]));
  if (!c || !plan) return { ignored: true };
  const next = pre.next_payment_date ? new Date(pre.next_payment_date) : null;
  await db.system(async (q) => {
    if (pre.status === 'authorized') {
      await q("UPDATE companies SET plan_id = $2, status = 'active' WHERE id = $1 AND status <> 'suspended'", [c.id, plan.id]);
      await q("UPDATE subscriptions SET status = 'canceled' WHERE company_id = $1 AND status IN ('trialing','active','past_due')", [c.id]);
      await q("INSERT INTO subscriptions (company_id, plan_id, status, current_period_end, provider, provider_ref) VALUES ($1,$2,'active',$3,'mercadopago',$4)", [c.id, plan.id, next, String(pre.id)]);
      await q("UPDATE invoices SET status = 'paid', paid_at = now(), period_end = $3 WHERE provider = 'mercadopago' AND provider_ref = $1 AND company_id = $2", [String(pre.id), c.id, next]);
    } else if (['cancelled', 'paused'].includes(pre.status)) {
      await q("UPDATE subscriptions SET status = 'canceled' WHERE company_id = $1 AND provider = 'mercadopago' AND provider_ref = $2", [c.id, String(pre.id)]);
      const [start] = await q("SELECT id FROM plans WHERE code = 'start'");
      if (start) await q('UPDATE companies SET plan_id = $2 WHERE id = $1', [c.id, start.id]);
    }
  });
  return { status: pre.status, companyId: c.id };
}

module.exports = { startCheckout, verifySignature, syncPreapproval, setTransport, mpEnabled };
