'use strict';
// API pública del widget web. Se identifica la empresa por su ID público (lcb_…); NO es un secreto,
// por eso todo está limitado por tasa, tamaño y (opcionalmente) lista de orígenes permitidos.
const express = require('express');
const db = require('../db/pool');
const rl = require('../middleware/rateLimit');
const { wrap } = require('../middleware/errors');
const { parse, z, id } = require('../lib/validate');
const { clean } = require('../lib/text');
const { E } = require('../lib/httpError');
const orchestrator = require('../ai/orchestrator');

const router = express.Router();
const KEY_RE = /^lcb_[0-9a-f]{24}$/;

async function resolve(req) {
  const key = req.params.key;
  if (!KEY_RE.test(key)) throw E.notFound('Widget no encontrado');
  const [c] = await db.system((q) => q('SELECT id, name, status, widget, brand_primary, brand_secondary, logo_url FROM companies WHERE public_key = $1', [key]));
  if (!c || c.status === 'suspended' || c.widget?.enabled === false) throw E.notFound('Widget no disponible');
  const allowed = c.widget?.allowed_origins || [];
  const origin = req.get('origin');
  if (allowed.length && (!origin || !allowed.includes(origin))) throw E.forbidden('Origen no permitido para este widget');
  req.widgetOrigin = origin;
  return c;
}
async function pickAgent(c) {
  return db.tenant(c.id, async (q) => {
    const wanted = c.widget?.agent_id;
    const [a] = await q(`SELECT id, name, avatar, welcome_message, description FROM agents WHERE status = 'active' AND ($1::uuid IS NULL OR id = $1) ORDER BY ($1::uuid IS NULL AND type = 'attention') DESC, created_at LIMIT 1`, [wanted || null]);
    return a || null;
  });
}

// CORS: refleja solo orígenes permitidos (sin credenciales)
router.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); res.set('Access-Control-Allow-Headers', 'content-type'); res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.set('Cross-Origin-Resource-Policy', 'cross-origin'); }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
router.use(rl.widget);

router.get('/:key/config', wrap(async (req, res) => {
  const c = await resolve(req);
  const agent = await pickAgent(c);
  if (!agent) throw E.notFound('No hay un agente activo para el widget');
  const w = c.widget || {};
  res.json({ company: c.name, agent: { name: agent.name, avatar: agent.avatar, welcome: agent.welcome_message || '¡Hola! ¿En qué puedo ayudarte?', description: agent.description }, theme: { primary: c.brand_primary, secondary: c.brand_secondary, logo: c.logo_url }, position: w.position === 'left' ? 'left' : 'right', title: w.title || '' });
}));

const visitor = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
router.post('/:key/chat', wrap(async (req, res) => {
  const c = await resolve(req);
  const b = parse(z.object({ visitorId: visitor, conversationId: id.optional().nullable(), message: z.string().trim().min(1).max(1000).transform((v) => clean(v, 1000)) }), req.body);
  const agent = await pickAgent(c);
  if (!agent) throw E.notFound('No hay un agente activo');
  const out = await orchestrator.handleCustomerMessage({ companyId: c.id, agentId: agent.id, conversationId: b.conversationId || null, channel: 'widget', message: b.message, visitorId: b.visitorId, contactName: 'Visitante web', requireActive: true, maxMessages: 80, maxTokens: 500 });
  res.json({ conversationId: out.conversationId, reply: out.reply, status: out.status, mode: out.mode, extra: out.automationReplies });
}));

// Historial / mensajes nuevos (respuestas de una persona del equipo)
router.get('/:key/messages', wrap(async (req, res) => {
  const c = await resolve(req);
  const f = parse(z.object({ visitorId: visitor, conversationId: id, after: z.string().datetime().optional() }), req.query);
  const out = await db.tenant(c.id, async (q) => {
    const [conv] = await q('SELECT id, status, mode, visitor_hash FROM conversations WHERE id = $1 AND channel = \'widget\'', [f.conversationId]);
    if (!conv || conv.visitor_hash !== orchestrator.hashVisitor(f.visitorId)) throw E.notFound('Conversación no encontrada');
    const messages = await q("SELECT id, role, content, created_at FROM messages WHERE conversation_id = $1 AND role IN ('customer','ai','human') AND ($2::timestamptz IS NULL OR created_at > $2) ORDER BY created_at LIMIT 200", [conv.id, f.after || null]);
    return { status: conv.status, mode: conv.mode, messages };
  });
  res.json(out);
}));

module.exports = router;
