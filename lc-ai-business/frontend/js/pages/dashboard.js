import { h, set, fmtNum, fmtDate } from '../dom.js';
import { get } from '../api.js';
import { lineChart, columnChart, barList } from '../charts.js';

const RANGES = [['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes'], ['year', 'Año']];
const ACTION = { 'auth.login': 'inició sesión', 'auth.register': 'creó la cuenta', 'agent.create': 'creó un agente', 'agent.update': 'editó un agente', 'agent.delete': 'eliminó un agente', 'document.upload': 'subió un documento', 'document.create_text': 'agregó un texto', 'document.delete': 'eliminó un documento', 'user.create': 'creó un usuario', 'user.update': 'editó un usuario', 'company.update': 'actualizó la empresa', 'conversation.take': 'tomó una conversación', 'conversation.release': 'devolvió una conversación a la IA', 'conversation.close': 'finalizó una conversación' };

export default async function page({ path, state }) {
  const isAnalytics = path === '/analytics';
  let range = 'month';
  const body = h('div');
  async function load() {
    const d = await get(`/api/analytics/overview?range=${range}`);
    const t = d.totals;
    const stat = (lbl, val, sub, v) => h('div', { class: 'card stat' + (v ? ' v' : '') }, h('div', { class: 'lbl' }, lbl), h('div', { class: 'val' }, fmtNum(val)), sub ? h('div', { class: 'sub' }, sub) : null);
    const hours = Array.from({ length: 24 }, (_, i) => ({ label: `${i}h`, value: d.activityByHour.find((x) => x.h === i)?.n || 0 }));
    set(body, 
      h('div', { class: 'grid g-stats' },
        stat('Agentes activos', t.agents_active, `${t.agents} en total`), stat('Conversaciones', t.conversations, 'en el período', true),
        stat('Consultas', t.queries, 'mensajes de clientes'), stat('Clientes atendidos', t.people, 'visitantes únicos', true),
        stat('Derivadas a humano', t.handoffs, `${t.waiting_human} esperando ahora`), stat('Documentos', t.documents, `${fmtNum(t.chunks)} fragmentos`, true),
        stat('Consumo de IA', t.tokens, 'tokens', false), stat('Usuarios', t.users, 'activos', true)),
      t.waiting_human ? h('div', { class: 'alert', style: { marginTop: '16px' } }, `⚠ ${t.waiting_human} conversación(es) requieren atención humana. `, h('a', { href: '/conversations' }, 'Ver bandeja')) : null,
      h('div', { class: 'grid g-2', style: { marginTop: '16px' } },
        h('div', { class: 'card' }, h('h3', null, 'Conversaciones por día'), lineChart(d.conversationsPerDay.map((x) => ({ label: x.day.slice(5), value: x.n })), { label: 'Conversaciones por día' })),
        h('div', { class: 'card' }, h('h3', null, 'Consultas por agente'), barList(d.queriesPerAgent.map((a) => ({ label: a.name, value: a.n }))))),
      h('div', { class: 'grid g-2', style: { marginTop: '16px' } },
        h('div', { class: 'card' }, h('h3', null, 'Horarios de mayor actividad'), columnChart(hours, { label: 'Actividad por hora' })),
        h('div', { class: 'card' }, h('h3', null, 'Actividad reciente'),
          d.recentActivity.length ? h('ul', { class: 'activity' }, d.recentActivity.map((a) => h('li', null, h('span', { class: 'dot' }), h('div', null, h('b', null, a.user_name || 'Sistema'), ' ', ACTION[a.action] || a.action, h('div', { class: 'small dim' }, fmtDate(a.created_at)))))) : h('p', { class: 'mute small' }, 'Sin actividad.'))),
      h('div', { class: 'card', style: { marginTop: '16px' } }, h('h3', null, 'Próximamente'), h('p', { class: 'mute small' }, 'Ventas generadas, leads, preguntas frecuentes y tiempo de respuesta llegan con las Fases 2 y 3 (CRM, productos y automatizaciones).')));
  }
  const tabs = h('div', { class: 'chips', style: { display: 'flex', gap: '6px' } });
  const paint = () => tabs.replaceChildren(...RANGES.map(([k, l]) => h('button', { class: 'chip' + (k === range ? ' on' : ''), onclick: async () => { range = k; paint(); await load(); } }, l)));
  paint(); await load();
  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, isAnalytics ? 'LC-AI Analytics' : `Hola, ${state.user.name.split(' ')[0]} 👋`), h('p', null, isAnalytics ? 'Métricas de tu operación con IA.' : `Resumen de ${state.company?.name}.`)),
      h('div', { class: 'actions' }, tabs, state.perms.includes('agents:write') ? h('a', { class: 'btn primary', href: '/agents/create' }, '+ Nuevo agente') : null)),
    body);
}
