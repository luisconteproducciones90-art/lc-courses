'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { clean } = require('../lib/text');
const { E } = require('../lib/httpError');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(authenticate);
const STATUSES = ['ai', 'waiting_customer', 'needs_human', 'closed'];

async function getConv(q, cid) {
  const [c] = await q(
    `SELECT c.*, a.name AS agent_name, a.avatar AS agent_avatar, u.name AS assigned_name FROM conversations c
       JOIN agents a ON a.id = c.agent_id LEFT JOIN users u ON u.id = c.assigned_user_id WHERE c.id = $1`, [cid]);
  if (!c) throw E.notFound('Conversación no encontrada');
  return c;
}

router.get('/', requirePerm('conversations:read'), wrap(async (req, res) => {
  const f = parse(z.object({ status: z.enum(STATUSES).optional(), agentId: id.optional(), q: str(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), req.query);
  const rows = await db.tenant(req.user.companyId, (q) => q(
    `SELECT c.id, c.status, c.mode, c.channel, c.contact_name, c.tags, c.last_message_at, c.handoff_reason, a.name AS agent_name, a.avatar AS agent_avatar,
            (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM conversations c JOIN agents a ON a.id = c.agent_id
      WHERE ($1::text IS NULL OR c.status = $1) AND ($2::uuid IS NULL OR c.agent_id = $2)
        AND ($3::text IS NULL OR c.contact_name ILIKE '%' || $3 || '%' OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content ILIKE '%' || $3 || '%'))
      ORDER BY c.last_message_at DESC LIMIT $4`,
    [f.status || null, f.agentId || null, f.q ? f.q.replace(/[%_\\]/g, '\\$&') : null, f.limit]));
  const counts = await db.tenant(req.user.companyId, (q) => q('SELECT status, count(*)::int n FROM conversations GROUP BY status'));
  res.json({ conversations: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
}));

router.get('/:id', requirePerm('conversations:read'), wrap(async (req, res) => {
  const cid = parse(id, req.params.id);
  const out = await db.tenant(req.user.companyId, async (q) => ({
    conversation: await getConv(q, cid),
    messages: await q('SELECT m.id, m.role, m.content, m.created_at, m.meta, u.name AS user_name FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.conversation_id = $1 ORDER BY m.created_at ASC LIMIT 500', [cid]),
    notes: await q('SELECT n.id, n.body, n.created_at, u.name AS user_name FROM conversation_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.conversation_id = $1 ORDER BY n.created_at ASC', [cid]),
  }));
  res.json(out);
}));

// Responder manualmente (toma el control si estaba la IA)
router.post('/:id/messages', requirePerm('conversations:reply'), wrap(async (req, res) => {
  const cid = parse(id, req.params.id);
  const { content } = parse(z.object({ content: z.string().trim().min(1).max(4000).transform((v) => clean(v, 4000)) }), req.body);
  const msg = await db.tenant(req.user.companyId, async (q) => {
    const c = await getConv(q, cid);
    if (c.status === 'closed') throw E.conflict('La conversación está finalizada');
    const [m] = await q("INSERT INTO messages (company_id, conversation_id, role, content, user_id) VALUES ($1,$2,'human',$3,$4) RETURNING id, role, content, created_at", [req.user.companyId, cid, content, req.user.id]);
    await q("UPDATE conversations SET mode = 'human', status = 'waiting_customer', assigned_user_id = $2, last_message_at = now() WHERE id = $1", [cid, req.user.id]);
    return m;
  });
  res.status(201).json({ message: msg });
}));

const action = (name, fn) => router.post(`/:id/${name}`, requirePerm('conversations:reply'), wrap(async (req, res) => {
  const cid = parse(id, req.params.id);
  const conversation = await db.tenant(req.user.companyId, async (q) => { await getConv(q, cid); await fn(q, cid, req); return getConv(q, cid); });
  await audit(req, `conversation.${name}`, 'conversation', cid);
  res.json({ conversation });
}));
action('take', (q, cid, req) => q("UPDATE conversations SET mode = 'human', assigned_user_id = $2, status = CASE WHEN status = 'closed' THEN status ELSE 'waiting_customer' END WHERE id = $1", [cid, req.user.id]));
action('release', (q, cid) => q("UPDATE conversations SET mode = 'ai', assigned_user_id = NULL, handoff_reason = '', status = CASE WHEN status = 'closed' THEN status ELSE 'waiting_customer' END WHERE id = $1", [cid]));
action('close', (q, cid) => q("UPDATE conversations SET status = 'closed' WHERE id = $1", [cid]));
action('reopen', (q, cid) => q("UPDATE conversations SET status = 'waiting_customer' WHERE id = $1 AND status = 'closed'", [cid]));

router.put('/:id/tags', requirePerm('conversations:reply'), wrap(async (req, res) => {
  const cid = parse(id, req.params.id);
  const { tags } = parse(z.object({ tags: z.array(z.string().trim().min(1).max(30)).max(10) }), req.body);
  const conversation = await db.tenant(req.user.companyId, async (q) => { await getConv(q, cid); await q('UPDATE conversations SET tags = $2 WHERE id = $1', [cid, [...new Set(tags.map((t) => clean(t, 30)))]]); return getConv(q, cid); });
  res.json({ conversation });
}));

router.post('/:id/notes', requirePerm('conversations:reply'), wrap(async (req, res) => {
  const cid = parse(id, req.params.id);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(2000).transform((v) => clean(v, 2000)) }), req.body);
  const [note] = await db.tenant(req.user.companyId, async (q) => {
    await getConv(q, cid);
    return q('INSERT INTO conversation_notes (company_id, conversation_id, user_id, body) VALUES ($1,$2,$3,$4) RETURNING id, body, created_at', [req.user.companyId, cid, req.user.id, body]);
  }).then((r) => (Array.isArray(r) ? r : [r]));
  res.status(201).json({ note: { ...note, user_name: req.user.name } });
}));

module.exports = router;
