import { h, field, toast, modal, confirmBox, fmtDate } from '../dom.js';
import { get, post, put, del } from '../api.js';
import { navigate } from '../main.js';
import { errMsg } from '../forms.js';

const ROLES = { company_admin: 'Administrador', operator: 'Operador', viewer: 'Solo lectura' };
const roleLabel = (u) => u.role_name || ROLES[u.role] || 'SUPER ADMIN';

export default async function page({ state }) {
  const cur = h('input', { type: 'password', autocomplete: 'current-password' }); const nw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 10 });
  const pw = h('form', { onsubmit: async (e) => { e.preventDefault(); try { await post('/api/auth/change-password', { currentPassword: cur.value, newPassword: nw.value }); cur.value = nw.value = ''; toast('Contraseña actualizada'); } catch (x) { toast(errMsg(x), true); } } },
    field('Contraseña actual', cur), field('Nueva contraseña', nw, 'Mínimo 10 caracteres, con letras y números.'), h('button', { class: 'btn', type: 'submit' }, 'Cambiar contraseña'));

  const canRoles = state.perms.includes('roles:read');
  const rolesData = canRoles ? await get('/api/roles') : { roles: [], catalog: [] };
  // Opciones de rol: base (base:x) y propios (custom:id)
  const roleOptions = (selected) => [h('optgroup', { label: 'Roles base' }, Object.entries(ROLES).map(([v, l]) => h('option', { value: `base:${v}`, selected: selected === `base:${v}` }, l))),
    rolesData.roles.length ? h('optgroup', { label: 'Roles de tu empresa' }, rolesData.roles.map((r) => h('option', { value: `custom:${r.id}`, selected: selected === `custom:${r.id}` }, r.name))) : null];
  const roleBody = (val) => (val.startsWith('custom:') ? { role_id: val.slice(7) } : { role: val.slice(5) });
  const current = (u) => (u.role_id ? `custom:${u.role_id}` : `base:${u.role}`);

  let team = null; let rolesSec = null;
  if (state.perms.includes('users:read')) {
    const { users } = await get('/api/users'); const canW = state.perms.includes('users:write');
    team = h('div', { class: 'card pad0', style: { marginTop: '16px' } },
      h('div', { style: { padding: '16px 18px', display: 'flex', alignItems: 'center' } }, h('h3', { style: { margin: 0 } }, 'Equipo'), canW ? h('button', { class: 'btn sm primary right', onclick: addUser }, '+ Agregar usuario') : null),
      h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Nombre', 'Email', 'Rol', 'Estado', 'Último acceso'].map((t) => h('th', null, t)))),
        h('tbody', null, users.map((u) => h('tr', null, h('td', null, h('b', null, u.name)), h('td', null, u.email),
          h('td', null, canW && u.id !== state.user.id ? h('select', { 'aria-label': 'Rol', onchange: async (e) => { try { await put('/api/users/' + u.id, roleBody(e.target.value)); toast('Rol actualizado'); } catch (x) { toast(errMsg(x), true); navigate('/settings'); } } }, roleOptions(current(u))) : roleLabel(u)),
          h('td', null, canW && u.id !== state.user.id ? h('button', { class: 'btn sm', onclick: async () => { try { await put('/api/users/' + u.id, { status: u.status === 'active' ? 'disabled' : 'active' }); navigate('/settings'); } catch (x) { toast(errMsg(x), true); } } }, u.status === 'active' ? 'Activo ✓' : 'Desactivado') : h('span', { class: 'badge green' }, 'Activo')),
          h('td', { class: 'small dim' }, u.last_login_at ? fmtDate(u.last_login_at) : '—')))))));
    function addUser() {
      const f = { name: h('input', { maxlength: 120 }), email: h('input', { type: 'email' }), password: h('input', { type: 'password', autocomplete: 'new-password' }), role: h('select', null, roleOptions('base:operator')) };
      modal({ title: 'Agregar usuario', body: h('div', null, field('Nombre', f.name), field('Email', f.email), field('Contraseña inicial', f.password, 'Compartila de forma segura; la persona podrá cambiarla.'), field('Rol', f.role)),
        actions: [{ label: 'Cancelar' }, { label: 'Crear', cls: 'primary', run: async () => { try { await post('/api/users', { name: f.name.value, email: f.email.value, password: f.password.value, ...roleBody(f.role.value) }); toast('Usuario creado'); navigate('/settings'); } catch (x) { toast(errMsg(x), true); return false; } } }] });
    }
  }

  if (canRoles) {
    const canRW = state.perms.includes('roles:write');
    const editRole = (r) => {
      const name = h('input', { value: r?.name || '', maxlength: 60, placeholder: 'Ej: Vendedor' }); const desc = h('input', { value: r?.description || '', maxlength: 200, placeholder: 'Qué hace esta persona' });
      const boxes = {}; const err = h('div', { class: 'alert err', hidden: true });
      const groups = rolesData.catalog.map((g) => h('div', { style: { marginBottom: '10px' } }, h('div', { class: 'small mono dim', style: { marginBottom: '4px' } }, g.group.toUpperCase()),
        g.items.map((i) => { const b = h('input', { type: 'checkbox', checked: !!r?.permissions.includes(i.key) }); boxes[i.key] = b; return h('label', { class: 'check', style: { marginBottom: '4px' } }, b, i.label); })));
      modal({ title: r ? `Editar rol: ${r.name}` : 'Nuevo rol', body: h('div', null, field('Nombre', name), field('Descripción', desc), h('h3', { style: { margin: '6px 0 10px' } }, 'Permisos'), h('p', { class: 'small mute', style: { marginBottom: '10px' } }, 'La gestión de usuarios, roles y pagos es solo del administrador y no se puede delegar. "Editar" incluye "Ver".'), ...groups, err),
        actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async () => {
          err.hidden = true; const body = { name: name.value, description: desc.value, permissions: Object.entries(boxes).filter(([, b]) => b.checked).map(([k]) => k) };
          try { if (r) await put('/api/roles/' + r.id, body); else await post('/api/roles', body); toast('Rol guardado'); navigate('/settings'); } catch (x) { err.textContent = errMsg(x); err.hidden = false; return false; }
        } }] });
    };
    rolesSec = h('div', { class: 'card', style: { marginTop: '16px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } }, h('h3', { style: { margin: 0 } }, 'Roles de la empresa'), canRW ? h('button', { class: 'btn sm primary right', onclick: () => editRole(null) }, '+ Nuevo rol') : null),
      h('p', { class: 'small mute', style: { marginBottom: '10px' } }, 'Además de Administrador, Operador y Solo lectura, creá roles a medida (ej: Vendedor, Soporte, Contador).'),
      rolesData.roles.length ? rolesData.roles.map((r) => h('div', { class: 'item-row' }, h('div', { style: { flex: 1, minWidth: '200px' } }, h('b', null, r.name), h('div', { class: 'small mute' }, r.description || '—'), h('div', { class: 'small dim' }, `${r.permissions.length} permisos · ${r.users} usuario${r.users === 1 ? '' : 's'}`)),
        canRW ? h('div', { class: 'row-actions' }, h('button', { class: 'btn sm', onclick: () => editRole(r) }, 'Editar'), h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox('Eliminar rol', `${r.users} usuario(s) pasarán a "Solo lectura".`, 'Eliminar')) { await del('/api/roles/' + r.id); navigate('/settings'); } } }, 'Eliminar')) : null)) : h('p', { class: 'dim small' }, 'Todavía no creaste roles propios.'));
  }

  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Configuración'), h('p', null, `${state.user.name} · ${state.user.email}`))),
    h('div', { class: 'grid g-2' }, h('div', { class: 'card' }, h('h3', null, 'Mi cuenta'), h('p', { class: 'mute small', style: { marginBottom: '12px' } }, `Rol: ${state.user.role_name || ROLES[state.user.role] || 'SUPER ADMIN'}`), pw)), team, rolesSec);
}
