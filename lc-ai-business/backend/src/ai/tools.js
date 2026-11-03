'use strict';
// Catálogo de herramientas de IA. Principios:
//  - El tenant (companyId) lo inyecta el SERVIDOR; el modelo nunca lo elige.
//  - Entradas validadas con zod.
//  - Fase 1: solo lectura + derivación. Acciones con efecto (crear lead/pedido) llegan en Fase 2 con aprobación.
const { z } = require('zod');
const db = require('../db/pool');
const retriever = require('./retriever');

const CATALOG = {
  search_knowledge: {
    label: 'Consultar documentos',
    description: 'Busca información en los documentos y la base de conocimiento de la empresa. Usala antes de responder datos concretos (precios, políticas, horarios, productos).',
    schema: z.object({ query: z.string().trim().min(2).max(200) }),
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Qué buscar, en pocas palabras' } }, required: ['query'] },
    risky: false,
    async run(ctx, { query }) {
      const rows = await db.tenant(ctx.companyId, (q) => retriever.search(q, { query, agentId: ctx.agentId, limit: 4 }));
      if (!rows.length) return { found: false, message: 'Sin resultados en los documentos de la empresa.' };
      return { found: true, results: rows.map((r) => ({ source: r.title, text: r.content.slice(0, 900) })) };
    },
  },
  handoff_to_human: {
    label: 'Derivar a una persona',
    description: 'Deriva la conversación a una persona del equipo. Usala si el cliente lo pide, si no tenés la información, o si el tema es sensible (reclamos, pagos, urgencias).',
    schema: z.object({ reason: z.string().trim().min(2).max(300) }),
    input_schema: { type: 'object', properties: { reason: { type: 'string', description: 'Motivo de la derivación' } }, required: ['reason'] },
    risky: false,
    async run(ctx, { reason }) {
      ctx.handoff = reason;
      return { ok: true, message: 'Conversación derivada. Avisale al cliente que una persona continuará la atención.' };
    },
  },
};

const IMPLEMENTED = Object.keys(CATALOG);
// Herramientas planificadas (visibles en la UI como "próximamente").
const PLANNED = [
  ['query_products', 'Consultar productos', 2], ['query_stock', 'Consultar stock', 2], ['query_customers', 'Consultar clientes', 2],
  ['create_lead', 'Crear lead', 2], ['create_quote', 'Crear presupuesto', 2], ['create_order', 'Crear pedido', 2],
  ['create_ticket', 'Crear ticket', 2], ['query_hours', 'Consultar horarios', 2],
].map(([name, label, phase]) => ({ name, label, phase }));

function definitionsFor(enabledNames) {
  return enabledNames.filter((n) => CATALOG[n]).map((n) => ({ name: n, description: CATALOG[n].description, input_schema: CATALOG[n].input_schema }));
}

async function execute(ctx, name, rawInput) {
  const tool = CATALOG[name];
  if (!tool || !ctx.allowed.includes(name)) return { error: 'Herramienta no disponible para este agente.' };
  if (tool.risky) return { error: 'Esta acción requiere aprobación humana.' };
  const parsed = tool.schema.safeParse(rawInput || {});
  if (!parsed.success) return { error: 'Argumentos inválidos.' };
  try { return await tool.run(ctx, parsed.data); } catch (e) { return { error: 'La herramienta falló.' }; }
}

module.exports = { CATALOG, IMPLEMENTED, PLANNED, definitionsFor, execute };
