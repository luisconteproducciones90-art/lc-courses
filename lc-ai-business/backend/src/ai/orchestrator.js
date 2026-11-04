'use strict';
// Flujo de un mensaje entrante: guarda, recupera conocimiento, arma prompt, llama a la IA (con tools), guarda respuesta.
// Las transacciones de BD son cortas: la llamada al proveedor ocurre FUERA de ellas.
const crypto = require('crypto');
const db = require('../db/pool');
const providers = require('./providers');
const retriever = require('./retriever');
const promptBuilder = require('./promptBuilder');
const tools = require('./tools');
const log = require('../lib/logger');
const events = require('../services/events');
const domain = require('../services/domain');
const limits = require('../services/limits');
const { E } = require('../lib/httpError');

const MAX_TOOL_ROUNDS = 3;
const FALLBACK = 'Tuve un inconveniente técnico y no pude responderte. Una persona del equipo va a continuar la atención.';

const { isOpen } = require('../lib/schedule');

const hashVisitor = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

/**
 * @param {object} p { companyId, agentId, conversationId?, channel, message, visitorId?, contactName?, ignoreSchedule?, requireActive? }
 * @returns {{conversationId, reply: string|null, status, mode, messages}}
 */
async function handleCustomerMessage(p) {
  // 1) Contexto + guardar mensaje del cliente
  const ctx = await db.tenant(p.companyId, async (q) => {
    const [agent] = await q('SELECT * FROM agents WHERE id = $1', [p.agentId]);
    if (!agent) throw E.notFound('Agente no encontrado');
    if (p.requireActive && agent.status !== 'active') throw E.notFound('Agente no disponible');
    const [company] = await q('SELECT * FROM companies WHERE id = $1', [p.companyId]);

    let conv; let newConversation = false;
    if (p.conversationId) {
      [conv] = await q('SELECT * FROM conversations WHERE id = $1 AND agent_id = $2', [p.conversationId, p.agentId]);
      if (!conv) throw E.notFound('Conversación no encontrada');
      if (p.visitorId && conv.visitor_hash !== hashVisitor(p.visitorId)) throw E.notFound('Conversación no encontrada');
    } else {
      [conv] = await q(
        `INSERT INTO conversations (company_id, agent_id, customer_id, channel, contact_name, visitor_hash, external_contact) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [p.companyId, p.agentId, p.customerId || null, p.channel, p.contactName || '', p.visitorId ? hashVisitor(p.visitorId) : null, p.externalContact || '']);
      newConversation = true;
    }
    if (p.maxMessages) {
      const [{ n }] = await q("SELECT count(*)::int n FROM messages WHERE conversation_id = $1 AND role = 'customer'", [conv.id]);
      if (n >= p.maxMessages) throw E.tooMany('Esta conversación de prueba alcanzó su límite de mensajes. Iniciá una nueva.');
    }
    const history = await q('SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 20', [conv.id]);
    history.reverse();
    await q("INSERT INTO messages (company_id, conversation_id, role, content, external_id) VALUES ($1,$2,'customer',$3,$4)", [p.companyId, conv.id, p.message, p.externalId || null]);
    if (p.customerId) await q('UPDATE customers SET last_contact_at = now(), last_agent_id = $2 WHERE id = $1', [p.customerId, p.agentId]);

    const humanMode = conv.mode === 'human';
    await q("UPDATE conversations SET last_message_at = now(), status = CASE WHEN $2 THEN 'needs_human' ELSE 'ai' END WHERE id = $1", [conv.id, humanMode]);

    let knowledge = [];
    let enabledTools = [];
    let approvals = {};
    if (!humanMode) {
      const trows = (await q('SELECT tool_name, requires_approval FROM agent_tools WHERE agent_id = $1 AND enabled', [agent.id])).filter((r) => tools.IMPLEMENTED.includes(r.tool_name));
      enabledTools = trows.map((r) => r.tool_name);
      approvals = Object.fromEntries(trows.map((r) => [r.tool_name, r.requires_approval]));
    }
    return { agent, company, conv, history, knowledge, enabledTools, approvals, humanMode, newConversation };
  });

  const { agent, company, conv } = ctx;
  if (!ctx.humanMode && agent.data_sources?.knowledge !== false) ctx.knowledge = (await retriever.hybrid(p.companyId, { query: p.message, agentId: agent.id, limit: 5 })).results;
  const lim = ctx.humanMode ? { ok: true } : await limits.checkMessaging(p.companyId, { newConversation: ctx.newConversation });
  if (!lim.ok) {
    if (p.channel === 'test') throw E.limit(`${lim.reason} Actualizá el plan para seguir probando agentes.`);
    await db.tenant(p.companyId, async (q) => {
      const [dup] = await q("SELECT 1 FROM notifications WHERE title = 'Límite de plan alcanzado' AND created_at > now() - interval '1 day'");
      if (!dup) await domain.notify(q, p.companyId, { title: 'Límite de plan alcanzado', body: `${lim.reason} Los clientes reciben un aviso y se derivan a una persona.`, level: 'alert', link: '/billing' });
    });
    return saveReply(p.companyId, conv.id, 'En este momento no podemos responderte automáticamente. Dejanos tu consulta y una persona del equipo te va a contestar.', { limit: lim.kind }, 'needs_human', lim.reason, agent.id, null, []);
  }
  const autoReplies = await events.emit(p.companyId, 'message.received', { text: p.message, conversationId: conv.id, agentId: agent.id, customerId: conv.customer_id || null });
  if (ctx.humanMode) return finish(p.companyId, conv.id, null, 'needs_human', 'human', autoReplies);

  // 2) Fuera de horario
  if (!p.ignoreSchedule && !isOpen(agent.schedule, company.timezone)) {
    const text = agent.offline_message || 'Ahora estamos fuera de horario. Dejanos tu consulta y te respondemos apenas volvamos.';
    return saveReply(p.companyId, conv.id, text, { offline: true }, 'waiting_customer', null, undefined, undefined, autoReplies);
  }

  // 3) Prompt + bucle de herramientas
  const built = promptBuilder.build({ agent, company, knowledge: ctx.knowledge, history: ctx.history, userMessage: p.message, toolNames: ctx.enabledTools });
  const toolCtx = { companyId: p.companyId, agentId: agent.id, conversationId: conv.id, channel: p.channel, contact: p.contactId || '', allowed: ctx.enabledTools, approvals: ctx.approvals, handoff: null };
  let provider; let model;
  let totalIn = 0; let totalOut = 0; let text = ''; let failed = false;
  try {
    ({ provider, model } = await providers.resolve());
    const msgs = [...built.messages];
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const out = await provider.generate({
        system: built.system, messages: msgs, tools: round < MAX_TOOL_ROUNDS ? tools.definitionsFor(ctx.enabledTools) : [],
        maxTokens: p.maxTokens || 700, model, context: { knowledge: ctx.knowledge, agentName: agent.name },
      });
      totalIn += out.usage?.input || 0; totalOut += out.usage?.output || 0;
      if (!out.toolCalls?.length) { text = out.text; break; }
      msgs.push({ role: 'assistant', content: out.text, toolCalls: out.toolCalls });
      for (const call of out.toolCalls) {
        const result = await tools.execute(toolCtx, call.name, call.input);
        msgs.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(result) });
      }
    }
  } catch (e) {
    failed = true;
    log.error('ai generation failed', { err: e.message, agentId: agent.id });
  }

  if (failed || !text.trim()) {
    return saveReply(p.companyId, conv.id, failed ? FALLBACK : (toolCtx.handoff ? 'Te derivo con una persona del equipo.' : FALLBACK),
      { error: failed }, 'needs_human', failed ? 'Falla técnica del proveedor de IA' : toolCtx.handoff, agent.id, null, autoReplies);
  }
  const clean = text.replace(/##\s*SYSTEM[\s\S]*$/i, '').trim().slice(0, 4000) || FALLBACK; // no filtrar delimitadores internos
  const usage = { provider: provider.name, model, in: totalIn, out: totalOut };
  return saveReply(p.companyId, conv.id, clean, { provider: provider.name, sources: ctx.knowledge.map((k) => k.title) },
    toolCtx.handoff ? 'needs_human' : 'waiting_customer', toolCtx.handoff, agent.id, usage, autoReplies);
}

async function saveReply(companyId, convId, text, meta, status, handoffReason, agentId, usage, autoReplies = []) {
  await db.tenant(companyId, async (q) => {
    await q("INSERT INTO messages (company_id, conversation_id, role, content, meta) VALUES ($1,$2,'ai',$3,$4)", [companyId, convId, text, JSON.stringify(meta || {})]);
    const handoff = status === 'needs_human';
    await q('UPDATE conversations SET status = $2, mode = CASE WHEN $3 THEN $4 ELSE mode END, handoff_reason = CASE WHEN $3 THEN $5 ELSE handoff_reason END, last_message_at = now() WHERE id = $1',
      [convId, status, handoff, 'human', handoffReason || '']);
    if (usage) await q('INSERT INTO usage (company_id, agent_id, conversation_id, provider, model, tokens_in, tokens_out) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [companyId, agentId, convId, usage.provider, usage.model, usage.in, usage.out]);
    if (status === 'needs_human') await domain.notify(q, companyId, { title: 'Conversación requiere atención humana', body: handoffReason || '', level: 'alert', link: '/conversations' });
  });
  if (status === 'needs_human') await events.emit(companyId, 'conversation.handoff', { conversationId: convId, reason: handoffReason || '', agentId });
  return finish(companyId, convId, text, status, undefined, autoReplies);
}

async function finish(companyId, convId, reply, status, mode, autoReplies = []) {
  const out = await db.tenant(companyId, async (q) => {
    const [c] = await q('SELECT status, mode FROM conversations WHERE id = $1', [convId]);
    const messages = await q('SELECT id, role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 200', [convId]);
    return { c, messages };
  });
  return { conversationId: convId, reply, status: out.c.status, mode: mode || out.c.mode, messages: out.messages, automationReplies: autoReplies };
}

module.exports = { handleCustomerMessage, isOpen, hashVisitor };
