import { h, icon, confirmBox, toast } from '../dom.js';
import { get, del } from '../api.js';
import { navigate } from '../main.js';

export const STATUS = { draft: ['Borrador', 'amber'], active: ['Activo', 'green'], paused: ['Pausado', 'red'] };

export default async function page({ state }) {
  const { agents } = await get('/api/agents');
  const canWrite = state.perms.includes('agents:write');
  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Agentes IA'), h('p', null, 'Asistentes especializados para tu negocio.')),
      h('div', { class: 'actions' }, canWrite ? h('a', { class: 'btn primary', href: '/agents/create' }, icon('plus'), 'Crear agente') : null)),
    agents.length ? h('div', { class: 'grid g-3' }, agents.map((a) => {
      const [label, cls] = STATUS[a.status];
      return h('div', { class: 'card agent-card', tabindex: 0, role: 'link', onclick: () => navigate('/agents/' + a.id), onkeydown: (e) => { if (e.key === 'Enter') navigate('/agents/' + a.id); } },
        h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, h('div', { class: 'agent-ava' }, a.avatar && !a.avatar.startsWith('http') ? a.avatar : '🤖'),
          h('div', { style: { minWidth: 0 } }, h('h3', { style: { margin: 0 } }, a.name), h('span', { class: 'badge ' + cls }, label))),
        h('p', { class: 'mute small' }, a.description || 'Sin descripción'),
        h('div', { class: 'small dim mono' }, `${a.conversations} conversaciones · autonomía ${a.autonomy}`),
        canWrite ? h('div', null, h('button', { class: 'btn sm danger', onclick: async (e) => { e.stopPropagation(); if (await confirmBox('Eliminar agente', `Se eliminará "${a.name}" y sus conversaciones.`, 'Eliminar')) { await del('/api/agents/' + a.id); toast('Agente eliminado'); navigate('/agents'); } } }, icon('trash'), 'Eliminar')) : null);
    })) : h('div', { class: 'card empty' }, h('div', { class: 'ico' }, '🤖'), h('h2', null, 'Todavía no tenés agentes'), h('p', { style: { margin: '6px 0 16px' } }, 'Creá tu primer asistente: atención, ventas, stock, turnos o uno a medida.'), canWrite ? h('a', { class: 'btn primary', href: '/agents/create' }, 'Crear mi primer agente') : null));
}
