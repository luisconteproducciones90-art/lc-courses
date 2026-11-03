'use strict';
// Catálogo de herramientas de IA. Principios:
//  - El tenant (companyId) y la conversación los inyecta el SERVIDOR; el modelo nunca los elige.
//  - Entradas validadas con zod. Los precios salen siempre de la base de datos.
//  - Herramientas con efecto (lead, ticket, presupuesto, pedido): si el agente las tiene con "requiere aprobación",
//    se guarda una acción pendiente que una persona aprueba o rechaza.
const { z } = require('zod');
const db = require('../db/pool');
const retriever = require('./retriever');
const domain = require('../services/domain');
const events = require('../services/events');
const { isOpen } = require('../lib/schedule');

const itemsSchema = z.array(z.object({ sku: z.string().trim().max(80).optional(), name: z.string().trim().max(120).optional(), qty: z.number().int().min(1).max(10000).default(1) })).min(1).max(20);
const itemsJson = { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' }, name: { type: 'string' }, qty: { type: 'integer' } } }, description: 'Productos pedidos (sku o nombre y cantidad)' };

async function searchProducts(q, text, limit = 5) {
  const tokens = [...new Set((String(text).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).slice(0, 8))];
  if (!tokens.length) return [];
  return q(`SELECT p.id, p.sku, p.name, p.brand, p.price, p.stock, p.stock_min, p.description, c.name AS category
      FROM products p LEFT JOIN categories c ON c.id = p.category_id,
           (SELECT websearch_to_tsquery('spanish'::regconfig, $1) AS qq) w
     WHERE p.status = 'active' AND (p.tsv @@ w.qq OR p.name ILIKE '%' || $2 || '%' OR lower(p.sku) = lower($2))
     ORDER BY ts_rank(p.tsv, w.qq) DESC, p.name LIMIT $3`, [tokens.join(' or '), text.replace(/[%_\\]/g, '\\$&').slice(0, 80), limit]);
}
const productView = (p) => ({ name: p.name, sku: p.sku, brand: p.brand, price: Number(p.price), stock_units: p.stock, availability: domain.stockLabel(p), category: p.category || '' });

const CATALOG = {
  search_knowledge: {
    label: 'Consultar documentos', effect: false,
    description: 'Busca información en los documentos y la base de conocimiento de la empresa. Usala antes de responder políticas, horarios o datos generales.',
    schema: z.object({ query: z.string().trim().min(2).max(200) }),
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Qué buscar, en pocas palabras' } }, required: ['query'] },
    async run(ctx, { query }) {
      const rows = await db.tenant(ctx.companyId, (q) => retriever.search(q, { query, agentId: ctx.agentId, limit: 4 }));
      if (!rows.length) return { found: false, message: 'Sin resultados en los documentos de la empresa.' };
      return { found: true, results: rows.map((r) => ({ source: r.title, text: r.content.slice(0, 900) })) };
    },
  },
  query_products: {
    label: 'Consultar productos y precios', effect: false,
    description: 'Busca productos del catálogo por nombre, marca o código y devuelve precio y disponibilidad reales. Usala SIEMPRE antes de dar un precio.',
    schema: z.object({ query: z.string().trim().min(2).max(120) }),
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Producto, marca o código' } }, required: ['query'] },
    async run(ctx, { query }) {
      const rows = await db.tenant(ctx.companyId, (q) => searchProducts(q, query));
      return rows.length ? { found: true, products: rows.map(productView) } : { found: false, message: 'No hay productos que coincidan en el catálogo.' };
    },
  },
  query_stock: {
    label: 'Consultar stock', effect: false,
    description: 'Consulta la disponibilidad (stock) de un producto. Usala siempre antes de afirmar que hay o no hay stock.',
    schema: z.object({ query: z.string().trim().min(2).max(120) }),
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Producto, marca o código' } }, required: ['query'] },
    async run(ctx, { query }) {
      const rows = await db.tenant(ctx.companyId, (q) => searchProducts(q, query, 4));
      return rows.length ? { found: true, products: rows.map((p) => ({ name: p.name, sku: p.sku, availability: domain.stockLabel(p), stock_units: p.stock })) } : { found: false, message: 'Producto no encontrado en el catálogo.' };
    },
  },
  query_customers: {
    label: 'Consultar datos del cliente', effect: false,
    description: 'Devuelve los datos del cliente de ESTA conversación (nombre, contacto, estado). No permite consultar a otras personas.',
    schema: z.object({}),
    input_schema: { type: 'object', properties: {} },
    async run(ctx) {
      if (!ctx.conversationId) return { found: false };
      const [c] = await db.tenant(ctx.companyId, (q) => q('SELECT c.first_name, c.last_name, c.phone, c.email, c.lead_status, c.last_purchase_at FROM conversations v JOIN customers c ON c.id = v.customer_id WHERE v.id = $1', [ctx.conversationId]));
      return c ? { found: true, customer: c } : { found: false, message: 'Todavía no hay datos del cliente en esta conversación.' };
    },
  },
  query_hours: {
    label: 'Consultar horarios', effect: false,
    description: 'Devuelve el horario de atención de la empresa y si está abierta en este momento.',
    schema: z.object({}),
    input_schema: { type: 'object', properties: {} },
    async run(ctx) {
      const [r] = await db.tenant(ctx.companyId, (q) => q('SELECT c.business_hours, c.timezone, a.schedule FROM companies c, agents a WHERE c.id = $1 AND a.id = $2', [ctx.companyId, ctx.agentId]));
      return { business_hours: r.business_hours || 'No informado', open_now: isOpen(r.schedule, r.timezone) };
    },
  },
  handoff_to_human: {
    label: 'Derivar a una persona', effect: false,
    description: 'Deriva la conversación a una persona del equipo. Usala si el cliente lo pide, si no tenés la información, o si el tema es sensible (reclamos, pagos, urgencias).',
    schema: z.object({ reason: z.string().trim().min(2).max(300) }),
    input_schema: { type: 'object', properties: { reason: { type: 'string', description: 'Motivo de la derivación' } }, required: ['reason'] },
    async run(ctx, { reason }) { ctx.handoff = reason; return { ok: true, message: 'Conversación derivada. Avisale al cliente que una persona continuará la atención.' }; },
  },
  create_lead: {
    label: 'Crear lead', effect: true, defaultApproval: false,
    description: 'Registra a un cliente interesado (lead) con sus datos de contacto. Pedí el nombre y un teléfono o email antes de usarla.',
    schema: z.object({ name: z.string().trim().max(120).optional(), phone: z.string().trim().max(40).optional(), email: z.string().trim().max(200).optional(), interest: z.string().trim().min(2).max(500) }),
    input_schema: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, interest: { type: 'string', description: 'Qué necesita el cliente' } }, required: ['interest'] },
    async effect(q, ctx, i) {
      const { customer, created } = await domain.upsertCustomer(q, ctx.companyId, { name: i.name, phone: i.phone, email: i.email, whatsapp: ctx.channel === 'whatsapp' ? ctx.contact : '', source: 'ai' });
      await domain.linkCustomer(q, ctx.conversationId, customer.id, ctx.agentId);
      const lead = await domain.createLead(q, ctx.companyId, { customerId: customer.id, conversationId: ctx.conversationId, agentId: ctx.agentId, interest: i.interest });
      return { result: { ok: true, lead_id: lead.id }, events: [...(created ? [['customer.created', { customerId: customer.id }]] : []), ['lead.created', { customerId: customer.id, leadId: lead.id, conversationId: ctx.conversationId, text: i.interest }]] };
    },
  },
  create_ticket: {
    label: 'Crear ticket', effect: true, defaultApproval: false,
    description: 'Crea un ticket de seguimiento para el equipo (reclamo, consulta técnica, tarea pendiente).',
    schema: z.object({ title: z.string().trim().min(3).max(160), description: z.string().trim().max(2000).optional(), priority: z.enum(['low', 'normal', 'high']).optional() }),
    input_schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'normal', 'high'] } }, required: ['title'] },
    async effect(q, ctx, i) {
      const [cv] = ctx.conversationId ? await q('SELECT customer_id FROM conversations WHERE id = $1', [ctx.conversationId]) : [];
      const t = await domain.createTicket(q, ctx.companyId, { ...i, customerId: cv?.customer_id, conversationId: ctx.conversationId, agentId: ctx.agentId });
      return { result: { ok: true, ticket_id: t.id }, events: [] };
    },
  },
  create_quote: {
    label: 'Crear presupuesto', effect: true, defaultApproval: true,
    description: 'Genera un presupuesto con productos del catálogo. Los precios los calcula el sistema; no los indiques vos.',
    schema: z.object({ items: itemsSchema, notes: z.string().trim().max(1000).optional() }),
    input_schema: { type: 'object', properties: { items: itemsJson, notes: { type: 'string' } }, required: ['items'] },
    async effect(q, ctx, i) {
      const [cv] = ctx.conversationId ? await q('SELECT customer_id FROM conversations WHERE id = $1', [ctx.conversationId]) : [];
      const o = await domain.createOrder(q, ctx.companyId, { kind: 'quote', items: i.items, notes: i.notes, customerId: cv?.customer_id, conversationId: ctx.conversationId, agentId: ctx.agentId });
      if (cv?.customer_id) await q("UPDATE customers SET lead_status = 'quote' WHERE id = $1 AND lead_status IN ('new','contacted','interested')", [cv.customer_id]);
      return { result: { ok: true, quote_id: o.id, total: Number(o.total), items: o.items }, events: [['quote.requested', { customerId: cv?.customer_id, conversationId: ctx.conversationId, orderId: o.id }]] };
    },
  },
  create_order: {
    label: 'Crear pedido', effect: true, defaultApproval: true,
    description: 'Crea un pedido con productos del catálogo (verifica stock). Los precios los calcula el sistema.',
    schema: z.object({ items: itemsSchema, notes: z.string().trim().max(1000).optional() }),
    input_schema: { type: 'object', properties: { items: itemsJson, notes: { type: 'string' } }, required: ['items'] },
    async effect(q, ctx, i) {
      const [cv] = ctx.conversationId ? await q('SELECT customer_id FROM conversations WHERE id = $1', [ctx.conversationId]) : [];
      const o = await domain.createOrder(q, ctx.companyId, { kind: 'order', items: i.items, notes: i.notes, customerId: cv?.customer_id, conversationId: ctx.conversationId, agentId: ctx.agentId });
      return { result: { ok: true, order_id: o.id, total: Number(o.total), items: o.items }, events: [['order.created', { orderId: o.id, conversationId: ctx.conversationId }]] };
    },
  },
};

const IMPLEMENTED = Object.keys(CATALOG);
const PLANNED = [];
const defaultApproval = (name) => !!CATALOG[name]?.defaultApproval;

function definitionsFor(names) {
  return names.filter((n) => CATALOG[n]).map((n) => ({ name: n, description: CATALOG[n].description, input_schema: CATALOG[n].input_schema }));
}

/** Ejecuta el efecto de una herramienta (directo o al aprobar una acción pendiente). */
async function performEffect(name, ctx, input) {
  const tool = CATALOG[name];
  const out = await db.tenant(ctx.companyId, (q) => tool.effect(q, ctx, input));
  for (const [ev, payload] of out.events) await events.emit(ctx.companyId, ev, { ...payload, agentId: ctx.agentId });
  return out.result;
}

async function execute(ctx, name, rawInput) {
  const tool = CATALOG[name];
  if (!tool || !ctx.allowed.includes(name)) return { error: 'Herramienta no disponible para este agente.' };
  const parsed = tool.schema.safeParse(rawInput || {});
  if (!parsed.success) return { error: 'Argumentos inválidos.' };
  try {
    if (!tool.effect) return await tool.run(ctx, parsed.data);
    if (ctx.approvals?.[name]) {
      await db.tenant(ctx.companyId, async (q) => {
        await q('INSERT INTO pending_actions (company_id, agent_id, conversation_id, tool, input) VALUES ($1,$2,$3,$4,$5)', [ctx.companyId, ctx.agentId, ctx.conversationId, name, JSON.stringify({ ...parsed.data, _channel: ctx.channel, _contact: ctx.contact })]);
        await domain.notify(q, ctx.companyId, { title: `Acción pendiente de aprobación: ${tool.label}`, body: 'Un agente de IA propuso una acción que requiere tu aprobación.', level: 'warning', link: '/orders' });
      });
      return { pending: true, message: 'La acción quedó pendiente de aprobación de una persona del equipo. Avisale al cliente que se la confirmarán.' };
    }
    return await performEffect(name, ctx, parsed.data);
  } catch (e) { return { error: e.status && e.status < 500 ? e.message : 'La herramienta falló.' }; }
}

module.exports = { CATALOG, IMPLEMENTED, PLANNED, definitionsFor, execute, performEffect, defaultApproval, searchProducts };
