import { h, set, fmtNum, fmtDate } from '../dom.js';
import { get } from '../api.js';
import { lineChart, columnChart, barList } from '../charts.js';
import { money } from '../forms.js';

const RANGES = [['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes'], ['year', 'Año'], ['custom', 'Personalizado']];
const ACTION = { 'auth.login': 'inició sesión', 'auth.register': 'creó la cuenta', 'agent.create': 'creó un agente', 'agent.update': 'editó un agente', 'agent.delete': 'eliminó un agente', 'document.upload': 'subió un documento', 'document.create_text': 'agregó un texto', 'document.create_url': 'agregó una URL', 'document.delete': 'eliminó un documento', 'user.create': 'creó un usuario', 'user.update': 'editó un usuario', 'company.update': 'actualizó la empresa', 'conversation.take': 'tomó una conversación', 'conversation.release': 'devolvió una conversación a la IA', 'conversation.close': 'finalizó una conversación', 'product.create': 'creó un producto', 'product.import': 'importó productos', 'customer.create': 'creó un cliente', 'approval.approve': 'aprobó una acción de IA', 'approval.reject': 'rechazó una acción de IA', 'marketplace.install': 'instaló un agente del marketplace', 'whatsapp.config': 'configuró WhatsApp', 'apikey.create': 'creó una API key', 'webhook.create': 'creó un webhook', 'automation.create': 'creó una automatización' };
const secs = (s) => (s == null ? '—' : s < 60 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

export default async function page({ path, state }) {
  const isAnalytics = path === '/analytics';
  let range = 'month'; let from = ''; let to = '';
  const body = h('div'); const custom = h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' }, hidden: true });
  async function load() {
    const qs = new URLSearchParams({ range }); if (range === 'custom') { qs.set('from', from); qs.set('to', to); }
    let d; try { d = await get(`/api/analytics/overview?${qs}`); } catch (e) { set(body, h('div', { class: 'alert err' }, e.message)); return; }
    const t = d.totals;
    const stat = (lbl, val, sub, v) => h('div', { class: 'card stat' + (v ? ' v' : '') }, h('div', { class: 'lbl' }, lbl), h('div', { class: 'val' }, typeof val === 'string' ? val : fmtNum(val)), sub ? h('div', { class: 'sub' }, sub) : null);
    const hours = Array.from({ length: 24 }, (_, i) => ({ label: `${i}h`, value: d.activityByHour.find((x) => x.h === i)?.n || 0 }));
    const alerts = [t.waiting_human ? h('span', null, `⚠ ${t.waiting_human} conversación(es) requieren atención humana. `, h('a', { href: '/conversations' }, 'Ver bandeja')) : null, t.pending_approvals ? h('span', null, `✋ ${t.pending_approvals} acción(es) de IA esperan tu aprobación. `, h('a', { href: '/orders' }, 'Revisar')) : null, t.low_stock ? h('span', null, `📦 ${t.low_stock} producto(s) con stock bajo. `, h('a', { href: '/products' }, 'Ver')) : null].filter(Boolean);
    set(body,
      h('div', { class: 'grid g-stats' }, stat('Conversaciones', t.conversations, 'en el período'), stat('Consultas', t.queries, 'mensajes de clientes', true), stat('Clientes atendidos', t.people, 'únicos'), stat('Leads generados', t.leads, `${t.leads_won} ganados · conversión ${t.conversion}%`, true),
        stat('Ventas generadas', money(t.sales), `${t.quotes} presupuestos`), stat('Derivadas a humano', t.handoffs, `${t.waiting_human} esperando ahora`, true), stat('Tiempo de respuesta', secs(t.avg_response_secs), 'promedio'), stat('Consumo de IA', t.tokens, 'tokens', true),
        stat('Agentes activos', t.agents_active, `${t.agents} en total`), stat('Clientes (CRM)', t.customers, `${t.open_tickets} tickets abiertos`, true), stat('Documentos', t.documents, `${fmtNum(t.chunks)} fragmentos`), stat('Usuarios', t.users, 'activos', true)),
      alerts.length ? h('div', { class: 'alert', style: { marginTop: '16px', display: 'grid', gap: '4px' } }, ...alerts) : null,
      h('div', { class: 'grid g-2', style: { marginTop: '16px' } }, h('div', { class: 'card' }, h('h3', null, 'Conversaciones por día'), lineChart(d.conversationsPerDay.map((x) => ({ label: x.day.slice(5), value: x.n })), { label: 'Conversaciones por día' })),
        h('div', { class: 'card' }, h('h3', null, 'Leads por día'), columnChart(d.conversationsPerDay.map((x) => ({ label: x.day.slice(5), value: x.leads })), { label: 'Leads por día' }))),
      h('div', { class: 'grid g-2', style: { marginTop: '16px' } }, h('div', { class: 'card' }, h('h3', null, 'Consultas por agente'), barList(d.queriesPerAgent.map((a) => ({ label: a.name, value: a.n })))), h('div', { class: 'card' }, h('h3', null, 'Horarios de mayor actividad'), columnChart(hours, { label: 'Actividad por hora' }))),
      h('div', { class: 'grid g-2', style: { marginTop: '16px' } }, h('div', { class: 'card' }, h('h3', null, 'Preguntas frecuentes'), d.faq.length ? barList(d.faq.map((f) => ({ label: f.question, value: f.n }))) : h('p', { class: 'mute small' }, 'Todavía no hay consultas.')),
        h('div', { class: 'card' }, h('h3', null, 'Actividad reciente'), d.recentActivity.length ? h('ul', { class: 'activity' }, d.recentActivity.map((a) => h('li', null, h('span', { class: 'dot' }), h('div', null, h('b', null, a.user_name || 'Sistema'), ' ', ACTION[a.action] || a.action, h('div', { class: 'small dim' }, fmtDate(a.created_at)))))) : h('p', { class: 'mute small' }, 'Sin actividad.'))));
  }
  const tabs = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
  const f = h('input', { type: 'date', 'aria-label': 'Desde', style: { width: '150px' } }); const tt = h('input', { type: 'date', 'aria-label': 'Hasta', style: { width: '150px' } });
  custom.append(f, tt, h('button', { class: 'btn sm', onclick: () => { from = f.value; to = tt.value; load(); } }, 'Aplicar'));
  const paint = () => { set(tabs, ...RANGES.map(([k, l]) => h('button', { class: 'chip' + (k === range ? ' on' : ''), onclick: async () => { range = k; custom.hidden = k !== 'custom'; paint(); if (k !== 'custom') await load(); } }, l))); };
  paint(); await load();
  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, isAnalytics ? 'LC-AI Analytics' : `Hola, ${state.user.name.split(' ')[0]} 👋`), h('p', null, isAnalytics ? 'Métricas de tu operación con IA.' : `Resumen de ${state.company?.name}.`)),
      h('div', { class: 'actions' }, tabs, custom, state.perms.includes('agents:write') ? h('a', { class: 'btn primary', href: '/agents/create' }, '+ Nuevo agente') : null)), body);
}
