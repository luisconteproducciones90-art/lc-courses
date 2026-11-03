'use strict';
// Motor de automatizaciones: SI ocurre X (trigger + condiciones) ENTONCES hacer Y (acciones).
const db = require('../db/pool');
const log = require('../lib/logger');
const domain = require('./domain');
const { clean } = require('../lib/text');

const TRIGGERS = {
  'customer.created': 'Nuevo cliente',
  'message.received': 'Mensaje recibido',
  'quote.requested': 'Cliente solicita presupuesto',
  'stock.low': 'Stock bajo',
  'customer.inactive': 'Cliente sin comprar',
  'conversation.handoff': 'Conversación derivada a humano',
  'lead.created': 'Nuevo lead',
};
const ACTIONS = {
  notify: 'Crear notificación',
  send_message: 'Enviar mensaje en la conversación',
  create_lead: 'Crear lead',
  create_ticket: 'Crear tarea / ticket',
  handoff: 'Derivar a una persona',
  tag_conversation: 'Etiquetar conversación',
  set_lead_status: 'Cambiar estado del cliente',
};
const LEAD_STATUSES = ['new', 'contacted', 'interested', 'quote', 'customer', 'lost'];
const MAX_DEPTH = 2;

const fill = (tpl, ctx) => String(tpl || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => clean(k.split('.').reduce((o, p) => (o == null ? '' : o[p]), ctx) ?? '', 200));

function matches(conditions, payload) {
  const c = conditions || {};
  if (Array.isArray(c.keywords) && c.keywords.length) {
    const t = String(payload.text || '').toLowerCase();
    if (!c.keywords.some((k) => t.includes(String(k).toLowerCase()))) return false;
  }
  if (c.agentId && payload.agentId !== c.agentId) return false;
  return true;
}

async function runAction(q, companyId, a, ctx, depth) {
  switch (a.type) {
    case 'notify':
      await domain.notify(q, companyId, { title: fill(a.title || 'Automatización', ctx), body: fill(a.body, ctx), level: a.level || 'info', link: a.link || '' }); return 'notificación creada';
    case 'send_message':
      if (!ctx.conversationId) return 'sin conversación: omitido';
      await q("INSERT INTO messages (company_id, conversation_id, role, content, meta) VALUES ($1,$2,'ai',$3,'{\"automation\":true}')", [companyId, ctx.conversationId, fill(a.text, ctx).slice(0, 2000)]);
      await q('UPDATE conversations SET last_message_at = now() WHERE id = $1', [ctx.conversationId]);
      ctx.outbound = (ctx.outbound || []).concat(fill(a.text, ctx).slice(0, 2000)); return 'mensaje enviado';
    case 'create_lead': {
      const lead = await domain.createLead(q, companyId, { customerId: ctx.customerId, conversationId: ctx.conversationId, interest: fill(a.interest || ctx.text || '', ctx), source: 'automation' });
      ctx.leadId = lead.id; return 'lead creado';
    }
    case 'create_ticket':
      await domain.createTicket(q, companyId, { customerId: ctx.customerId, conversationId: ctx.conversationId, title: fill(a.title || 'Seguimiento', ctx), description: fill(a.description, ctx), priority: a.priority, source: 'automation' }); return 'ticket creado';
    case 'handoff':
      if (!ctx.conversationId) return 'sin conversación: omitido';
      await q("UPDATE conversations SET mode = 'human', status = 'needs_human', handoff_reason = $2 WHERE id = $1 AND status <> 'closed'", [ctx.conversationId, fill(a.reason || 'Derivada por automatización', ctx)]); return 'derivada';
    case 'tag_conversation':
      if (!ctx.conversationId || !a.tag) return 'omitido';
      await q('UPDATE conversations SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags || $2::text[]))) WHERE id = $1', [ctx.conversationId, [clean(a.tag, 30)]]); return 'etiquetada';
    case 'set_lead_status':
      if (!ctx.customerId || !LEAD_STATUSES.includes(a.status)) return 'omitido';
      await q('UPDATE customers SET lead_status = $2 WHERE id = $1', [ctx.customerId, a.status]); return 'estado actualizado';
    default: return 'acción desconocida';
  }
}

/** Dispara las automatizaciones habilitadas para un evento. Nunca lanza. Devuelve mensajes salientes a enviar al canal. */
async function fire(companyId, event, payload = {}, depth = 0) {
  const outbound = [];
  if (depth > MAX_DEPTH) return outbound;
  try {
    await db.tenant(companyId, async (q) => {
      const autos = await q('SELECT * FROM automations WHERE enabled AND trigger = $1', [event]);
      if (!autos.length) return;
      const ctx = { ...payload };
      if (payload.customerId) { const [c] = await q('SELECT * FROM customers WHERE id = $1', [payload.customerId]); if (c) ctx.customer = { name: `${c.first_name} ${c.last_name}`.trim() || 'cliente', phone: c.phone, email: c.email }; }
      if (payload.productId) { const [p] = await q('SELECT name, sku, stock FROM products WHERE id = $1', [payload.productId]); if (p) ctx.product = p; }
      for (const a of autos) {
        if (payload.onlyAutomation && a.id !== payload.onlyAutomation) continue;
        if (!matches(a.conditions, payload)) continue;
        const done = [];
        try {
          for (const act of a.actions || []) done.push(await runAction(q, companyId, act, ctx, depth));
          await q("INSERT INTO automation_logs (company_id, automation_id, event, status, detail) VALUES ($1,$2,$3,'ok',$4)", [companyId, a.id, event, JSON.stringify({ done, customerId: payload.customerId || null })]);
          await q('UPDATE automations SET runs = runs + 1, last_run_at = now() WHERE id = $1', [a.id]);
        } catch (e) {
          await q("INSERT INTO automation_logs (company_id, automation_id, event, status, detail) VALUES ($1,$2,$3,'error',$4)", [companyId, a.id, event, JSON.stringify({ error: String(e.message).slice(0, 200) })]);
        }
      }
      outbound.push(...(ctx.outbound || []));
    });
  } catch (e) { log.error('automation fire failed', { err: e.message, event }); }
  return outbound;
}

/** Tareas programadas: clientes inactivos. Llamar periódicamente (server.js) o desde tests. */
async function runInactiveCustomers() {
  const companies = await db.system((q) => q("SELECT DISTINCT company_id FROM automations WHERE enabled AND trigger = 'customer.inactive'"));
  let fired = 0;
  for (const { company_id: cid } of companies) {
    const autos = await db.tenant(cid, (q) => q("SELECT * FROM automations WHERE enabled AND trigger = 'customer.inactive'"));
    for (const a of autos) {
      const days = Math.max(1, Math.min(3650, Number(a.conditions?.days) || 30));
      const custs = await db.tenant(cid, (q) => q(
        `SELECT c.id FROM customers c WHERE COALESCE(c.last_purchase_at, c.created_at) < now() - ($1 || ' days')::interval
           AND NOT EXISTS (SELECT 1 FROM automation_logs l WHERE l.automation_id = $2 AND l.detail->>'customerId' = c.id::text AND l.created_at > now() - ($1 || ' days')::interval) LIMIT 200`, [String(days), a.id]));
      for (const c of custs) { await fire(cid, 'customer.inactive', { customerId: c.id, days, onlyAutomation: a.id }); fired += 1; }
    }
  }
  return fired;
}

module.exports = { fire, runInactiveCustomers, TRIGGERS, ACTIONS };
