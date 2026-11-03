import { h, logo } from '../dom.js';
import { get, post } from '../api.js';
import { chatBox } from '../chat.js';

const SUGG = { sales: ['Quiero un taladro, ¿qué me recomendás?', '¿Tienen pintura?'], attention: ['¿Cuál es el horario?', '¿Hacen envíos?', '¿Qué garantía tienen?'], stock: ['¿Tenés taladro Bosch?', '¿Hay atornillador Makita?'], manager: ['¿Cómo fueron las ventas del mes?', '¿Qué productos tienen stock bajo?'] };

export default async function page() {
  const { company, agents } = await get('/api/demo/agents');
  const visitorId = (crypto.randomUUID?.() || String(Math.random())).replace(/[^A-Za-z0-9]/g, '').padEnd(20, 'x').slice(0, 40);
  let current = agents[0];
  const stage = h('div');
  const tabs = h('div', { class: 'sugg', style: { justifyContent: 'center' } });
  function paint() {
    tabs.replaceChildren(...agents.map((a) => h('button', { class: 'chip' + (a.id === current.id ? ' on' : ''), onclick: () => { current = a; paint(); } }, `${a.avatar} ${a.name}`)));
    stage.replaceChildren(h('div', { class: 'grid g-2', style: { alignItems: 'start' } },
      h('div', { class: 'card' }, h('div', { class: 'agent-ava', style: { marginBottom: '12px' } }, current.avatar), h('h2', null, current.name), h('p', { class: 'mute', style: { margin: '8px 0 14px' } }, current.description),
        h('p', { class: 'small dim' }, `Este agente trabaja para "${company.name}", una empresa ficticia. Respondé solo con los datos de ejemplo que tiene cargados (catálogo, políticas e informe del mes).`), h('p', { class: 'small dim', style: { marginTop: '8px' } }, 'Es una demostración: no guardes datos personales.')),
      chatBox({ key: current.id, name: current.name, avatar: current.avatar, welcome: current.welcome_message, suggestions: SUGG[current.type] || [], send: (message, conversationId) => post('/api/demo/chat', { agentId: current.id, visitorId, conversationId, message }) })));
  }
  paint();
  return h('div', { class: 'demo' },
    h('div', { class: 'demo-top' }, logo(36), h('div', null, h('b', null, 'LC-AI BUSINESS'), h('div', { class: 'by' }, 'by LC-SYSTEM')), h('a', { class: 'btn right', href: '/login' }, 'Ingresar'), h('a', { class: 'btn primary', href: '/register' }, 'Crear cuenta')),
    h('div', { class: 'demo-head' }, h('h1', null, 'Probá ', h('span', { class: 'grad-text' }, 'LC-AI BUSINESS')), h('p', null, 'Descubrí cómo la IA puede trabajar para tu empresa.')),
    tabs, h('div', { style: { height: '18px' } }), stage);
}
