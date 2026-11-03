'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z } = require('../lib/validate');
const { E } = require('../lib/httpError');

const router = express.Router();
router.use(authenticate);
const DAYS = { today: 1, week: 7, month: 30, year: 365 };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

router.get('/overview', requirePerm('analytics:read'), wrap(async (req, res) => {
  const f = parse(z.object({ range: z.enum(['today', 'week', 'month', 'year', 'custom']).default('month'), from: date.optional(), to: date.optional() }), req.query);
  let since; let until;
  if (f.range === 'custom') {
    if (!f.from || !f.to || f.from > f.to) throw E.badRequest('Indicá un rango válido (desde ≤ hasta)');
    since = new Date(`${f.from}T00:00:00Z`); until = new Date(`${f.to}T00:00:00Z`); until.setUTCDate(until.getUTCDate() + 1);
    if ((until - since) / 864e5 > 800) throw E.badRequest('El rango máximo es de 800 días');
  } else { until = new Date(Date.now() + 1000); since = new Date(Date.now() - DAYS[f.range] * 864e5); }
  const days = Math.min(90, Math.max(1, Math.ceil((until - since) / 864e5)));
  const P = [since.toISOString(), until.toISOString()];

  const data = await db.tenant(req.user.companyId, async (q) => {
    const [tot] = await q(`SELECT
      (SELECT count(*)::int FROM agents) agents, (SELECT count(*)::int FROM agents WHERE status = 'active') agents_active,
      (SELECT count(*)::int FROM users WHERE status = 'active') users,
      (SELECT count(*)::int FROM documents) documents, (SELECT count(*)::int FROM knowledge_chunks) chunks,
      (SELECT count(*)::int FROM conversations WHERE created_at >= $1 AND created_at < $2) conversations,
      (SELECT count(*)::int FROM messages WHERE role = 'customer' AND created_at >= $1 AND created_at < $2) queries,
      (SELECT count(DISTINCT COALESCE(customer_id::text, visitor_hash, id::text))::int FROM conversations WHERE created_at >= $1 AND created_at < $2) people,
      (SELECT count(*)::int FROM conversations WHERE handoff_reason <> '' AND created_at >= $1 AND created_at < $2) handoffs,
      (SELECT count(*)::int FROM conversations WHERE status = 'needs_human') waiting_human,
      (SELECT COALESCE(sum(tokens_in + tokens_out),0)::int FROM usage WHERE created_at >= $1 AND created_at < $2) tokens,
      (SELECT count(*)::int FROM leads WHERE created_at >= $1 AND created_at < $2) leads,
      (SELECT count(*)::int FROM leads WHERE status = 'won' AND created_at >= $1 AND created_at < $2) leads_won,
      (SELECT count(*)::int FROM orders WHERE kind = 'quote' AND created_at >= $1 AND created_at < $2) quotes,
      (SELECT COALESCE(sum(total),0)::float FROM orders WHERE kind = 'order' AND status IN ('confirmed','delivered') AND created_at >= $1 AND created_at < $2) sales,
      (SELECT count(*)::int FROM customers) customers,
      (SELECT count(*)::int FROM products WHERE status = 'active' AND stock <= stock_min) low_stock,
      (SELECT count(*)::int FROM pending_actions WHERE status = 'pending') pending_approvals,
      (SELECT count(*)::int FROM tickets WHERE status <> 'closed') open_tickets,
      (SELECT count(*)::int FROM conversations WHERE created_at >= $1 AND created_at < $2 AND channel IN ('widget','whatsapp')) real_channel_conversations`, P);
    const [rt] = await q(`SELECT avg(extract(epoch FROM (r.created_at - m.created_at)))::float AS secs FROM messages m
      JOIN LATERAL (SELECT x.created_at FROM messages x WHERE x.conversation_id = m.conversation_id AND x.created_at > m.created_at AND x.role IN ('ai','human') ORDER BY x.created_at LIMIT 1) r ON true
      WHERE m.role = 'customer' AND m.created_at >= $1 AND m.created_at < $2`, P);
    const perDay = await q(`SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
        (SELECT count(*)::int FROM conversations c WHERE c.created_at::date = d::date) AS n,
        (SELECT count(*)::int FROM leads l WHERE l.created_at::date = d::date) AS leads,
        (SELECT COALESCE(sum(total),0)::float FROM orders o WHERE o.kind = 'order' AND o.status IN ('confirmed','delivered') AND o.created_at::date = d::date) AS sales
      FROM generate_series(GREATEST(($2::timestamptz - interval '1 day')::date - ${days - 1}, $1::timestamptz::date), ($2::timestamptz - interval '1 day')::date, interval '1 day') d ORDER BY d`, P);
    const perAgent = await q(`SELECT a.name, count(m.id)::int AS n FROM agents a LEFT JOIN conversations c ON c.agent_id = a.id AND c.created_at >= $1 AND c.created_at < $2
      LEFT JOIN messages m ON m.conversation_id = c.id AND m.role = 'customer' GROUP BY a.id ORDER BY n DESC LIMIT 8`, P);
    const perHour = await q(`SELECT extract(hour FROM created_at)::int AS h, count(*)::int AS n FROM messages WHERE role = 'customer' AND created_at >= $1 AND created_at < $2 GROUP BY 1 ORDER BY 1`, P);
    const faq = await q(`SELECT lower(regexp_replace(left(content, 120), '[?¿!¡.,]+', '', 'g')) AS question, count(*)::int AS n FROM messages WHERE role = 'customer' AND created_at >= $1 AND created_at < $2
      AND length(content) > 8 GROUP BY 1 HAVING count(*) >= 1 ORDER BY n DESC, 1 LIMIT 8`, P);
    const recent = await q('SELECT l.action, l.entity, l.created_at, u.name AS user_name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 8');
    return { totals: { ...tot, avg_response_secs: rt?.secs ?? null, conversion: tot.leads ? Math.round((tot.leads_won / tot.leads) * 1000) / 10 : 0 }, conversationsPerDay: perDay, queriesPerAgent: perAgent, activityByHour: perHour, faq, recentActivity: recent };
  });
  res.json({ range: f.range, from: since.toISOString(), to: until.toISOString(), ...data });
}));

module.exports = router;
