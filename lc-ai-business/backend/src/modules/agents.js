'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { clean } = require('../lib/text');
const { E } = require('../lib/httpError');
const { assertLimit } = require('../lib/plans');
const { audit } = require('../lib/audit');
const tools = require('../ai/tools');

const router = express.Router();
router.use(authenticate);

const TYPES = ['attention', 'sales', 'stock', 'admin', 'appointments', 'whatsapp', 'manager', 'custom'];
const base = ['search_knowledge', 'handoff_to_human'];
const cat = ['query_products', 'query_stock'];
const PRESETS = {
  attention: { label: 'Agente de Atención', icon: '🤖', description: 'Responde preguntas de clientes.', tone: 'amable y claro', personality: 'Paciente, empático y resolutivo.', objective: 'Resolver las consultas de los clientes con información verificada.', tools: [...base, 'query_hours', 'query_customers', 'create_ticket'] },
  sales: { label: 'Agente de Ventas', icon: '💰', description: 'Ayuda a vender productos y servicios.', tone: 'cercano y persuasivo', personality: 'Amable, profesional y persuasiva.', objective: 'Convertir consultas en ventas sin presionar.', rules: ['Nunca inventar precios ni stock.'], tools: [...base, ...cat, 'create_lead', 'create_quote'] },
  stock: { label: 'Agente de Stock', icon: '📦', description: 'Consulta productos, disponibilidad y precios.', tone: 'preciso', personality: 'Exacto y directo.', objective: 'Informar disponibilidad y precios reales.', rules: ['Nunca inventar precios ni stock. Si no figura, decir que se confirma con el equipo.'], tools: [...base, ...cat] },
  admin: { label: 'Agente Administrativo', icon: '📋', description: 'Ayuda con información interna y documentación.', tone: 'formal', personality: 'Ordenado y riguroso.', objective: 'Responder dudas internas con la documentación de la empresa.', tools: base },
  appointments: { label: 'Agente de Turnos', icon: '📅', description: 'Gestiona consultas y solicitudes de turnos.', tone: 'amable y ordenado', personality: 'Organizado y cordial.', objective: 'Tomar solicitudes de turno y derivarlas al equipo.', rules: ['No confirmar turnos: derivar a una persona para la confirmación.'], tools: [...base, 'query_hours', 'create_lead'] },
  whatsapp: { label: 'Agente WhatsApp', icon: '💬', description: 'Atiende conversaciones por WhatsApp (conexión en Fase 3).', tone: 'cercano y breve', personality: 'Ágil y cálido.', objective: 'Atender consultas con mensajes cortos.', tools: base },
  manager: { label: 'Agente Gerencial', icon: '📊', description: 'Analiza información del negocio y genera informes.', tone: 'ejecutivo', personality: 'Analítico y sintético.', objective: 'Resumir y analizar la información cargada del negocio.', tools: ['search_knowledge', 'query_products'] },
  custom: { label: 'Agente Personalizado', icon: '🧠', description: 'Instrucciones específicas definidas por el administrador.', tone: 'profesional', personality: '', objective: '', tools: base },
};

const rules = z.array(z.string().max(300).transform((v) => clean(v, 300))).max(20);
const windows = z.array(z.object({ days: z.array(z.number().int().min(1).max(7)).min(1), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })).max(14);
const agentSchema = z.object({
  name: str(80, 2), description: str(300), type: z.enum(TYPES), avatar: str(300).refine((v) => v === '' || /^https?:\/\//.test(v) || v.length <= 8, 'Avatar: URL http(s) o emoji'),
  personality: str(600).transform((v) => clean(v, 600)), tone: str(80), language: str(20, 2), objective: str(600).transform((v) => clean(v, 600)),
  instructions: z.string().max(4000).transform((v) => clean(v, 4000)), welcome_message: z.string().max(500).transform((v) => clean(v, 500)),
  offline_message: z.string().max(500).transform((v) => clean(v, 500)), rules,
  schedule: z.object({ enabled: z.boolean(), windows: windows.optional() }),
  data_sources: z.object({ knowledge: z.boolean() }), autonomy: z.enum(['low', 'medium', 'high']), status: z.enum(['draft', 'active', 'paused']),
  tools: z.array(z.enum(tools.IMPLEMENTED)).max(20), approvals: z.array(z.enum(tools.IMPLEMENTED)).max(20),
});
const COLS = ['name', 'description', 'type', 'avatar', 'personality', 'tone', 'language', 'objective', 'instructions', 'welcome_message', 'offline_message', 'rules', 'schedule', 'data_sources', 'autonomy', 'status'];
const JSONCOLS = new Set(['rules', 'schedule', 'data_sources']);

async function load(q, agentId) {
  const [a] = await q('SELECT * FROM agents WHERE id = $1', [agentId]);
  if (!a) throw E.notFound('Agente no encontrado');
  const trows = await q('SELECT tool_name, requires_approval FROM agent_tools WHERE agent_id = $1 AND enabled', [agentId]);
  a.tools = trows.map((t) => t.tool_name);
  a.approvals = trows.filter((t) => t.requires_approval).map((t) => t.tool_name);
  return a;
}
async function saveTools(q, companyId, agentId, names, approvals) {
  await q('DELETE FROM agent_tools WHERE agent_id = $1', [agentId]);
  for (const n of names) {
    // Herramientas con efecto: aprobación humana por defecto según el catálogo; el admin puede ajustarla.
    const needs = tools.CATALOG[n].effect ? (approvals ? approvals.includes(n) : tools.defaultApproval(n)) : false;
    await q('INSERT INTO agent_tools (company_id, agent_id, tool_name, requires_approval) VALUES ($1,$2,$3,$4)', [companyId, agentId, n, needs]);
  }
}

router.get('/meta', requirePerm('agents:read'), (req, res) => {
  res.json({
    types: TYPES.map((t) => ({ type: t, ...PRESETS[t] })),
    tools: [...tools.IMPLEMENTED.map((n) => ({ name: n, label: tools.CATALOG[n].label, available: true, effect: tools.CATALOG[n].effect, defaultApproval: !!tools.CATALOG[n].defaultApproval })), ...tools.PLANNED.map((t) => ({ ...t, available: false }))],
  });
});

router.get('/', requirePerm('agents:read'), wrap(async (req, res) => {
  const agents = await db.tenant(req.user.companyId, (q) => q(
    `SELECT a.*, (SELECT count(*)::int FROM conversations c WHERE c.agent_id = a.id) AS conversations FROM agents a ORDER BY a.created_at DESC`));
  res.json({ agents });
}));

router.get('/:id', requirePerm('agents:read'), wrap(async (req, res) => {
  res.json({ agent: await db.tenant(req.user.companyId, (q) => load(q, parse(id, req.params.id))) });
}));

router.post('/', requirePerm('agents:write'), wrap(async (req, res) => {
  const type = req.body?.type;
  const preset = PRESETS[type] || {};
  const b = parse(agentSchema.partial({ approvals: true, description: true, avatar: true, personality: true, tone: true, language: true, objective: true, instructions: true, welcome_message: true, offline_message: true, rules: true, schedule: true, data_sources: true, autonomy: true, status: true, tools: true }), req.body);
  const v = {
    description: preset.description || '', avatar: preset.icon || '', personality: preset.personality || '', tone: preset.tone || 'profesional', language: 'es',
    objective: preset.objective || '', instructions: '', welcome_message: '', offline_message: '', rules: preset.rules || [], schedule: { enabled: false },
    data_sources: { knowledge: true }, autonomy: 'medium', status: 'draft', tools: preset.tools || base, ...b,
  };
  const agent = await db.tenant(req.user.companyId, async (q) => {
    await assertLimit(q, req.user.companyId, 'agents');
    const [a] = await q(`INSERT INTO agents (company_id, created_by, ${COLS.join(',')}) VALUES ($1,$2,${COLS.map((_, i) => `$${i + 3}`).join(',')}) RETURNING id`,
      [req.user.companyId, req.user.id, ...COLS.map((c) => (JSONCOLS.has(c) ? JSON.stringify(v[c]) : v[c]))]);
    await saveTools(q, req.user.companyId, a.id, v.tools, b.approvals);
    return load(q, a.id);
  });
  await audit(req, 'agent.create', 'agent', agent.id, { type: agent.type });
  res.status(201).json({ agent });
}));

router.put('/:id', requirePerm('agents:write'), wrap(async (req, res) => {
  const aid = parse(id, req.params.id);
  const b = parse(agentSchema.partial(), req.body);
  const keys = COLS.filter((c) => b[c] !== undefined); // lista fija: nunca nombres de columna del cliente
  const agent = await db.tenant(req.user.companyId, async (q) => {
    await load(q, aid);
    if (keys.length) await q(`UPDATE agents SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [aid, ...keys.map((k) => (JSONCOLS.has(k) ? JSON.stringify(b[k]) : b[k]))]);
    if (b.tools || b.approvals) await saveTools(q, req.user.companyId, aid, b.tools || (await load(q, aid)).tools, b.approvals ?? (b.tools ? undefined : (await load(q, aid)).approvals));
    return load(q, aid);
  });
  await audit(req, 'agent.update', 'agent', aid, { fields: keys });
  res.json({ agent });
}));

router.delete('/:id', requirePerm('agents:write'), wrap(async (req, res) => {
  const aid = parse(id, req.params.id);
  const n = await db.tenant(req.user.companyId, (q) => q('DELETE FROM agents WHERE id = $1 RETURNING id', [aid]));
  if (!n.length) throw E.notFound('Agente no encontrado');
  await audit(req, 'agent.delete', 'agent', aid);
  res.json({ ok: true });
}));

module.exports = router;
