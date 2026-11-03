import { h, field, toast, modal, fmtNum, fmtDate } from '../dom.js';
import { get, post, put, patch } from '../api.js';
import { navigate } from '../main.js';

export default async function page() {
  const [{ stats }, { companies }, { plans }, ai, { logs }] = await Promise.all([get('/api/admin/stats'), get('/api/admin/companies'), get('/api/admin/plans'), get('/api/admin/ai'), get('/api/admin/audit')]);
  let tab = 'companies';
  const body = h('div');
  const stat = (l, v) => h('div', { class: 'card stat' }, h('div', { class: 'lbl' }, l), h('div', { class: 'val' }, fmtNum(v)));

  function newCompany() {
    const f = { name: h('input', { maxlength: 120 }), adminName: h('input', { maxlength: 120 }), adminEmail: h('input', { type: 'email' }), adminPassword: h('input', { type: 'password', autocomplete: 'new-password' }), planCode: h('select', null, plans.map((p) => h('option', { value: p.code }, p.name))) };
    modal({ title: 'Crear empresa', body: h('div', null, field('Nombre de la empresa', f.name), field('Nombre del administrador', f.adminName), field('Email del administrador', f.adminEmail), field('Contraseña inicial', f.adminPassword), field('Plan', f.planCode)),
      actions: [{ label: 'Cancelar' }, { label: 'Crear', cls: 'primary', run: async () => { try { await post('/api/admin/companies', Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value]))); toast('Empresa creada'); navigate('/admin'); } catch (x) { toast(x.details ? x.details.map((d) => d.message).join(', ') : x.message, true); return false; } } }] });
  }
  const ST = { trial: ['Prueba', 'amber'], active: ['Activa', 'green'], suspended: ['Suspendida', 'red'] };
  const views = {
    companies: () => h('div', { class: 'card pad0' }, h('div', { style: { padding: '14px 18px', display: 'flex' } }, h('h3', { style: { margin: 0 } }, 'Empresas'), h('button', { class: 'btn sm primary right', onclick: newCompany }, '+ Crear empresa')),
      h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Empresa', 'Plan', 'Usuarios', 'Agentes', 'Conv.', 'Tokens', 'Estado', ''].map((t) => h('th', null, t)))),
        h('tbody', null, companies.map((c) => h('tr', null, h('td', null, h('b', null, c.name), c.is_demo ? h('span', { class: 'tag', style: { marginLeft: '8px' } }, 'demo') : null),
          h('td', null, h('select', { 'aria-label': 'Plan', onchange: async (e) => { await patch('/api/admin/companies/' + c.id, { planCode: e.target.value }); toast('Plan actualizado'); } }, plans.map((p) => h('option', { value: p.code, selected: p.code === c.plan_code }, p.name)))),
          h('td', null, c.users), h('td', null, c.agents), h('td', null, c.conversations), h('td', { class: 'mono' }, fmtNum(c.tokens)), h('td', null, h('span', { class: 'badge ' + ST[c.status][1] }, ST[c.status][0])),
          h('td', null, c.is_demo ? null : h('button', { class: 'btn sm ' + (c.status === 'suspended' ? '' : 'danger'), onclick: async () => { await patch('/api/admin/companies/' + c.id, { status: c.status === 'suspended' ? 'active' : 'suspended' }); navigate('/admin'); } }, c.status === 'suspended' ? 'Reactivar' : 'Suspender')))))))),
    plans: () => h('div', { class: 'grid g-2' }, plans.map((p) => {
      const price = h('input', { type: 'number', min: 0, value: p.price_cents == null ? '' : p.price_cents / 100, placeholder: 'Sin precio definido' });
      const lim = Object.fromEntries(['users', 'agents', 'conversations', 'documents', 'storage_mb', 'ai_tokens'].map((k) => [k, h('input', { type: 'number', min: -1, value: p.limits[k] ?? -1 })]));
      return h('div', { class: 'card' }, h('h3', null, p.name, ' ', h('span', { class: 'small dim' }, p.description)), field(`Precio mensual (${p.currency})`, price, 'Vacío = sin precio definitivo todavía.'),
        h('div', { class: 'row' }, Object.entries(lim).map(([k, i]) => field(k.replace('_', ' '), i))), h('p', { class: 'small dim' }, '-1 = ilimitado'),
        h('button', { class: 'btn primary', style: { marginTop: '10px' }, onclick: async () => { try { await put('/api/admin/plans/' + p.id, { price_cents: price.value === '' ? null : Math.round(Number(price.value) * 100), limits: Object.fromEntries(Object.entries(lim).map(([k, i]) => [k, Number(i.value)])) }); toast('Plan guardado'); } catch (x) { toast(x.message, true); } } }, 'Guardar'));
    })),
    ai: () => {
      const sel = h('select', null, ai.providers.map((p) => h('option', { value: p.name, selected: ai.active?.provider === p.name }, `${p.name}${p.configured ? '' : ' (sin clave en el servidor)'}`)));
      return h('div', { class: 'card', style: { maxWidth: '640px' } }, h('h3', null, 'Proveedor de IA'), h('p', { class: 'mute small', style: { marginBottom: '12px' } }, 'Las claves API se configuran únicamente como variables de entorno del servidor y nunca se muestran ni viajan al navegador.'),
        field('Proveedor activo', sel), h('p', { class: 'small mute' }, ai.active ? `En uso: ${ai.active.provider} · ${ai.active.model}` : 'Sin proveedor operativo'),
        h('table', null, h('tbody', null, ai.providers.map((p) => h('tr', null, h('td', null, h('b', null, p.name)), h('td', null, h('span', { class: 'badge ' + (p.configured ? 'green' : '') }, p.configured ? 'clave presente' : 'sin clave')), h('td', { class: 'small dim' }, p.defaultModel))))),
        h('button', { class: 'btn primary', style: { marginTop: '14px' }, onclick: async () => { try { await put('/api/admin/ai', { provider: sel.value }); toast('Proveedor actualizado'); navigate('/admin'); } catch (x) { toast(x.message, true); } } }, 'Guardar'));
    },
    audit: () => h('div', { class: 'card pad0' }, h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Fecha', 'Empresa', 'Usuario', 'Acción', 'IP'].map((t) => h('th', null, t)))), h('tbody', null, logs.map((l) => h('tr', null, h('td', { class: 'small' }, fmtDate(l.created_at)), h('td', null, l.company_name || '—'), h('td', null, l.user_name || '—'), h('td', { class: 'mono small' }, l.action), h('td', { class: 'mono small dim' }, l.ip))))))),
  };
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const paint = () => { tabs.replaceChildren(...[['companies', 'Empresas'], ['plans', 'Planes'], ['ai', 'Proveedor de IA'], ['audit', 'Auditoría']].map(([k, l]) => h('button', { class: k === tab ? 'on' : '', role: 'tab', onclick: () => { tab = k; paint(); } }, l))); body.replaceChildren(views[tab]()); };
  paint();
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Administración LC-SYSTEM'), h('p', null, 'Vista global de la plataforma.'))),
    h('div', { class: 'grid g-stats', style: { marginBottom: '18px' } }, stat('Empresas', stats.companies), stat('Suspendidas', stats.suspended), stat('Usuarios', stats.users), stat('Agentes', stats.agents), stat('Conversaciones', stats.conversations), stat('Tokens de IA', stats.tokens)), tabs, body);
}
