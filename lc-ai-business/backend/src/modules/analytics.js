'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z } = require('../lib/validate');

const router = express.Router();
router.use(authenticate);

const RANGES = { today: 1, week: 7, month: 30, year: 365 };
router.get('/overview', requirePerm('analytics:read'), wrap(async (req, res) => {
  const { range } = parse(z.object({ range: z.enum(['today', 'week', 'month', 'year']).default('month') }), req.query);
  const days = RANGES[range];
  const data = await db.tenant(req.user.companyId, async (q) => {
    const since = `now() - interval '${days} days'`; // days sale de un mapa fijo
    const [tot] = await q(`SELECT
      (SELECT count(*)::int FROM agents) agents, (SELECT count(*)::int FROM agents WHERE status = 'active') agents_active,
      (SELECT count(*)::int FROM users WHERE status = 'active') users,
      (SELECT count(*)::int FROM documents) documents, (SELECT count(*)::int FROM knowledge_chunks) chunks,
      (SELECT count(*)::int FROM conversations WHERE created_at >= ${since}) conversations,
      (SELECT count(*)::int FROM messages WHERE role = 'customer' AND created_at >= ${since}) queries,
      (SELECT count(DISTINCT COALESCE(visitor_hash, id::text))::int FROM conversations WHERE created_at >= ${since}) people,
      (SELECT count(*)::int FROM conversations WHERE handoff_reason <> '' AND created_at >= ${since}) handoffs,
      (SELECT count(*)::int FROM conversations WHERE status = 'needs_human') waiting_human,
      (SELECT COALESCE(sum(tokens_in + tokens_out),0)::int FROM usage WHERE created_at >= ${since}) tokens`);
    const perDay = await q(`SELECT to_char(d::date, 'YYYY-MM-DD') AS day, (SELECT count(*)::int FROM conversations c WHERE c.created_at::date = d::date) AS n
      FROM generate_series(now()::date - ${Math.min(days, 30) - 1}, now()::date, interval '1 day') d ORDER BY d`);
    const perAgent = await q(`SELECT a.name, count(m.id)::int AS n FROM agents a LEFT JOIN conversations c ON c.agent_id = a.id AND c.created_at >= ${since}
      LEFT JOIN messages m ON m.conversation_id = c.id AND m.role = 'customer' GROUP BY a.id ORDER BY n DESC LIMIT 8`);
    const perHour = await q(`SELECT extract(hour FROM created_at)::int AS h, count(*)::int AS n FROM messages WHERE role = 'customer' AND created_at >= ${since} GROUP BY 1 ORDER BY 1`);
    const recent = await q(`SELECT l.action, l.entity, l.created_at, u.name AS user_name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 8`);
    return { totals: tot, conversationsPerDay: perDay, queriesPerAgent: perAgent, activityByHour: perHour, recentActivity: recent };
  });
  res.json({ range, ...data });
}));

module.exports = router;
