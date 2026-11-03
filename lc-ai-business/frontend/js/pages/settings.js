import { h, field, toast, modal, fmtDate } from '../dom.js';
import { get, post, put } from '../api.js';
import { navigate } from '../main.js';

const ROLES = { company_admin: 'Administrador', operator: 'Operador', viewer: 'Solo lectura' };

export default async function page({ state }) {
  const cur = h('input', { type: 'password', autocomplete: 'current-password' }); const nw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 10 });
  const pw = h('form', { onsubmit: async (e) => { e.preventDefault(); try { await post('/api/auth/change-password', { currentPassword: cur.value, newPassword: nw.value }); cur.value = nw.value = ''; toast('Contraseña actualizada'); } catch (x) { toast(x.details ? x.details.map((d) => d.message).join(', ') : x.message, true); } } },
    field('Contraseña actual', cur), field('Nueva contraseña', nw, 'Mínimo 10 caracteres, con letras y números.'), h('button', { class: 'btn', type: 'submit' }, 'Cambiar contraseña'));

  let team = null;
  if (state.perms.includes('users:read')) {
    const { users } = await get('/api/users'); const canW = state.perms.includes('users:write');
    team = h('div', { class: 'card pad0', style: { marginTop: '16px' } },
      h('div', { style: { padding: '16px 18px', display: 'flex', alignItems: 'center' } }, h('h3', { style: { margin: 0 } }, 'Equipo'), canW ? h('button', { class: 'btn sm primary right', onclick: addUser }, '+ Agregar usuario') : null),
      h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Nombre', 'Email', 'Rol', 'Estado', 'Último acceso'].map((t) => h('th', null, t)))),
        h('tbody', null, users.map((u) => h('tr', null, h('td', null, h('b', null, u.name)), h('td', null, u.email),
          h('td', null, canW && u.id !== state.user.id ? h('select', { 'aria-label': 'Rol', onchange: async (e) => { try { await put('/api/users/' + u.id, { role: e.target.value }); toast('Rol actualizado'); } catch (x) { toast(x.message, true); } } }, Object.entries(ROLES).map(([v, l]) => h('option', { value: v, selected: u.role === v }, l))) : ROLES[u.role]),
          h('td', null, canW && u.id !== state.user.id ? h('button', { class: 'btn sm', onclick: async () => { try { await put('/api/users/' + u.id, { status: u.status === 'active' ? 'disabled' : 'active' }); navigate('/settings'); } catch (x) { toast(x.message, true); } } }, u.status === 'active' ? 'Activo ✓' : 'Desactivado') : h('span', { class: 'badge green' }, 'Activo')),
          h('td', { class: 'small dim' }, u.last_login_at ? fmtDate(u.last_login_at) : '—')))))));
    function addUser() {
      const f = { name: h('input', { maxlength: 120 }), email: h('input', { type: 'email' }), password: h('input', { type: 'password', autocomplete: 'new-password' }), role: h('select', null, Object.entries(ROLES).map(([v, l]) => h('option', { value: v, selected: v === 'operator' }, l))) };
      modal({ title: 'Agregar usuario', body: h('div', null, field('Nombre', f.name), field('Email', f.email), field('Contraseña inicial', f.password, 'Compartila de forma segura; la persona podrá cambiarla.'), field('Rol', f.role)),
        actions: [{ label: 'Cancelar' }, { label: 'Crear', cls: 'primary', run: async () => { try { await post('/api/users', { name: f.name.value, email: f.email.value, password: f.password.value, role: f.role.value }); toast('Usuario creado'); navigate('/settings'); } catch (x) { toast(x.details ? x.details.map((d) => d.message).join(', ') : x.message, true); return false; } } }] });
    }
  }
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Configuración'), h('p', null, `${state.user.name} · ${state.user.email}`))),
    h('div', { class: 'grid g-2' }, h('div', { class: 'card' }, h('h3', null, 'Mi cuenta'), h('p', { class: 'mute small', style: { marginBottom: '12px' } }, `Rol: ${ROLES[state.user.role] || 'SUPER ADMIN'}`), pw)), team);
}
