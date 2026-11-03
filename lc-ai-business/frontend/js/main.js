import { h, clear, icon, logo, toast, initials } from './dom.js';
import { get, post } from './api.js';

export const state = { user: null, company: null, perms: [] };
export const can = (p) => state.perms.includes(p) || (p.startsWith('admin:') && state.perms.includes('admin:*'));

const lazy = (f) => async (ctx) => (await import(f)).default(ctx);
const ROUTES = [
  { path: '/login', page: lazy('./pages/login.js'), public: true },
  { path: '/register', page: lazy('./pages/login.js'), public: true },
  { path: '/demo', page: lazy('./pages/demo.js'), public: true },
  { path: '/dashboard', page: lazy('./pages/dashboard.js'), title: 'Dashboard' },
  { path: '/companies', page: lazy('./pages/company.js'), title: 'Empresa' },
  { path: '/agents', page: lazy('./pages/agents.js'), title: 'Agentes' },
  { path: '/agents/create', page: lazy('./pages/agentForm.js'), title: 'Nuevo agente' },
  { path: '/agents/:id', page: lazy('./pages/agentForm.js'), title: 'Agente' },
  { path: '/conversations', page: lazy('./pages/conversations.js'), title: 'Conversaciones' },
  { path: '/knowledge', page: lazy('./pages/knowledge.js'), title: 'Conocimiento' },
  { path: '/analytics', page: lazy('./pages/dashboard.js'), title: 'Analytics' },
  { path: '/settings', page: lazy('./pages/settings.js'), title: 'Configuración' },
  { path: '/admin', page: lazy('./pages/admin.js'), title: 'Administración', perm: 'admin:*' },
  ...[['customers', 'Clientes (CRM)', 2, 'users'], ['products', 'Productos y stock', 2, 'box'], ['automations', 'Automatizaciones', 2, 'zap'], ['integrations', 'Integraciones', 3, 'plug'], ['billing', 'Planes y facturación', 4, 'card']]
    .map(([p, title, phase, ic]) => ({ path: '/' + p, title, page: async () => (await import('./pages/soon.js')).default({ title, phase, ic }) })),
];

const NAV = [
  ['Principal', [['/dashboard', 'Dashboard', 'home'], ['/conversations', 'Conversaciones', 'chat', 'conversations:read'], ['/agents', 'Agentes IA', 'bot', 'agents:read'], ['/knowledge', 'Conocimiento', 'book', 'knowledge:read']]],
  ['Negocio', [['/customers', 'Clientes', 'users', null, 2], ['/products', 'Productos', 'box', null, 2], ['/automations', 'Automatizaciones', 'zap', null, 2], ['/analytics', 'Analytics', 'chart', 'analytics:read'], ['/integrations', 'Integraciones', 'plug', null, 3]]],
  ['Cuenta', [['/companies', 'Empresa', 'building', 'company:read'], ['/billing', 'Planes', 'card', null, 4], ['/settings', 'Configuración', 'cog'], ['/admin', 'SUPER ADMIN', 'shield', 'admin:*']]],
];

function match(path) {
  for (const r of ROUTES) {
    const names = []; const re = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
    const m = path.match(re);
    if (m) return { route: r, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

const root = document.getElementById('app');
let cleanups = [];
export const onLeave = (fn) => cleanups.push(fn);
export function navigate(path, replace) {
  if (location.pathname + location.search === path) return render();
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  return render();
}

function shell(content, path) {
  const side = h('aside', { class: 'side', id: 'side' },
    h('div', { class: 'brand' }, logo(38), h('div', null, h('b', null, 'LC-AI BUSINESS'), h('small', null, 'by LC-SYSTEM'))),
    h('nav', { class: 'nav' }, NAV.map(([label, items]) => [h('div', { class: 'nav-label' }, label),
      items.filter(([href, , , perm]) => (state.user.role === 'super_admin' ? ['/admin', '/settings'].includes(href) : !perm || can(perm))).map(([href, text, ic, , soon]) => h('a', { href, class: path === href || (href !== '/dashboard' && path.startsWith(href + '/')) ? 'active' : '' }, icon(ic), text, soon ? h('span', { class: 'soon' }, 'F' + soon) : null))])),
    h('div', { class: 'side-foot' },
      h('div', { class: 'me' }, h('div', { class: 'avatar' }, initials(state.user.name)), h('div', null, h('b', null, state.user.name), h('small', null, state.company?.name || 'LC-SYSTEM'))),
      h('button', { class: 'btn ghost sm', style: { width: '100%' }, onclick: logout }, icon('logout'), 'Cerrar sesión')));
  const scrim = h('div', { class: 'scrim', hidden: true, onclick: () => toggle(false) });
  scrim.hidden = true;
  function toggle(open) { side.classList.toggle('open', open); scrim.hidden = !open; }
  side.addEventListener('click', (e) => { if (e.target.closest('a')) toggle(false); });
  return h('div', { class: 'shell' }, side, scrim,
    h('div', null, h('div', { class: 'topbar' }, h('button', { class: 'burger', 'aria-label': 'Menú', onclick: () => toggle(true) }, '☰'), logo(26), h('b', null, 'LC-AI BUSINESS')), h('main', { class: 'main' }, content)));
}

async function logout() {
  await post('/api/auth/logout').catch(() => {});
  state.user = null; navigate('/login', true);
}

async function loadMe() {
  try {
    const me = await get('/api/auth/me');
    Object.assign(state, { user: me.user, company: me.company, perms: me.permissions });
  } catch { state.user = null; }
}

let token = 0;
async function render() {
  const my = ++token;
  cleanups.forEach((f) => { try { f(); } catch { /* noop */ } }); cleanups = [];
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return navigate(state.user ? (state.user.role === 'super_admin' ? '/admin' : '/dashboard') : '/login', true);
  const m = match(path);
  if (!m) { clear(root).append(h('div', { class: 'boot' }, h('div', { class: 'empty' }, h('h1', null, '404'), h('p', null, 'Página no encontrada.'), h('a', { href: '/dashboard' }, 'Volver al inicio')))); return null; }
  if (!state.user && !m.route.public) await loadMe();
  if (my !== token) return null;
  if (!m.route.public && !state.user) return navigate('/login', true);
  if (m.route.public && state.user && m.route.path !== '/demo') return navigate('/dashboard', true);
  if (m.route.perm && !can(m.route.perm)) return navigate('/dashboard', true);
  if (state.user?.role === 'super_admin' && !m.route.public && !['/admin', '/settings'].includes(m.route.path)) return navigate('/admin', true);
  try {
    const node = await m.route.page({ params: m.params, path, query: new URLSearchParams(location.search), state, onLeave, navigate });
    if (my !== token) return null;
    document.title = (m.route.title ? m.route.title + ' · ' : '') + 'LC-AI BUSINESS';
    clear(root).append(m.route.public ? node : shell(node, path));
    window.scrollTo(0, 0);
  } catch (e) {
    clear(root).append(h('div', { class: 'boot' }, h('div', { class: 'empty' }, h('h2', null, 'No pudimos cargar esta página'), h('p', null, e.message), h('button', { class: 'btn', onclick: render }, 'Reintentar'))));
  }
  return null;
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/"]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank' || a.hasAttribute('download')) return;
  e.preventDefault(); navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', render);
window.addEventListener('auth:lost', () => { state.user = null; toast('Tu sesión expiró. Ingresá nuevamente.', true); navigate('/login', true); });
export { loadMe };
render();
