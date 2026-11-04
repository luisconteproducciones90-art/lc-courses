'use strict';
// Límites de consumo por plan (-1 / ausente = ilimitado). Mensuales: conversaciones y tokens de IA.
const db = require('../db/pool');
const pricing = require('../lib/pricing');

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); };

async function usageFor(q, companyId, prices) {
  const [u] = await q(`SELECT
    (SELECT count(*)::int FROM users WHERE status = 'active') users, (SELECT count(*)::int FROM agents) agents, (SELECT count(*)::int FROM documents) documents,
    (SELECT COALESCE(sum(size_bytes),0)::float / 1048576 FROM documents) storage_mb,
    (SELECT count(*)::int FROM conversations WHERE created_at >= $1) conversations,
    (SELECT COALESCE(sum(tokens_in + tokens_out),0)::float FROM usage WHERE created_at >= $1) ai_tokens`, [monthStart()]);
  const out = { ...u, storage_mb: Math.round(u.storage_mb * 10) / 10 };
  if (prices) {
    const rows = await q('SELECT model, sum(tokens_in)::float tin, sum(tokens_out)::float tout FROM usage WHERE created_at >= $1 GROUP BY model', [monthStart()]);
    const c = pricing.cost(rows, prices); out.ai_cost = c.cost; out.ai_cost_unpriced_tokens = c.unpriced; out.currency = prices.currency || 'USD';
  }
  return out;
}

async function limitsFor(q, companyId) {
  const [r] = await q('SELECT p.limits, p.name, p.code FROM companies c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = $1', [companyId]);
  return { limits: r?.limits || {}, plan: r?.name || '—', code: r?.code || '' };
}
const over = (used, max) => max !== undefined && max !== null && max >= 0 && used >= max;

/** ¿Se puede atender un mensaje nuevo? Devuelve {ok} o {ok:false, reason}. */
async function checkMessaging(companyId, { newConversation }) {
  const prices = await pricing.get();
  return db.tenant(companyId, async (q) => {
    const { limits, plan } = await limitsFor(q, companyId);
    const u = await usageFor(q, companyId, prices);
    if (over(u.ai_cost, limits.ai_budget)) return { ok: false, reason: `Se alcanzó el presupuesto de IA del plan ${plan} este mes.`, kind: 'ai_budget' };
    if (over(u.ai_tokens, limits.ai_tokens)) return { ok: false, reason: `Se alcanzó el consumo de IA del plan ${plan} este mes.`, kind: 'ai_tokens' };
    if (newConversation && over(u.conversations, limits.conversations)) return { ok: false, reason: `Se alcanzó el límite de conversaciones del plan ${plan} este mes.`, kind: 'conversations' };
    return { ok: true };
  });
}

async function checkStorage(q, companyId, addBytes) {
  const { limits, plan } = await limitsFor(q, companyId);
  const max = limits.storage_mb;
  if (max === undefined || max === null || max < 0) return;
  const u = await usageFor(q, companyId);
  if (u.storage_mb + addBytes / 1048576 > max) throw require('../lib/httpError').E.limit(`El almacenamiento del plan ${plan} (${max} MB) se agotaría con este documento.`);
}

module.exports = { usageFor, limitsFor, checkMessaging, checkStorage, monthStart };
