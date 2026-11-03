import { h, fmtDate } from '../dom.js';
import { get, post } from '../api.js';
import { navigate } from '../main.js';

export default async function page() {
  const { notifications } = await get('/api/notifications');
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Notificaciones'), h('p', null, 'Alertas de la plataforma y de tus automatizaciones.')), h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => { await post('/api/notifications/read-all'); navigate('/notifications'); } }, 'Marcar todas como leídas'))),
    h('div', { class: 'card' }, notifications.length ? h('ul', { class: 'activity' }, notifications.map((n) => h('li', { style: { opacity: n.read_at ? 0.55 : 1 } }, h('span', { class: 'dot', style: { background: n.level === 'alert' ? 'var(--red)' : n.level === 'warning' ? 'var(--amber)' : 'var(--green)' } }),
      h('div', null, h('b', null, n.title), n.body ? h('div', { class: 'small mute' }, n.body) : null, h('div', { class: 'small dim' }, fmtDate(n.created_at), n.link ? [' · ', h('a', { href: n.link }, 'Ver')] : null))))) : h('div', { class: 'empty' }, h('div', { class: 'ico' }, '🔔'), 'No hay notificaciones.')));
}
