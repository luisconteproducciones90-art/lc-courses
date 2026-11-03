import { h, set, toast, modal, confirmBox, fmtDate, icon } from '../dom.js';
import { get, post, put, del } from '../api.js';
import { formModal, money, errMsg } from '../forms.js';
import { navigate } from '../main.js';

const ST = { new: ['Nuevo', 'blue'], contacted: ['Contactado', 'amber'], interested: ['Interesado', 'violet'], quote: ['Presupuesto', 'violet'], customer: ['Cliente', 'green'], lost: ['Perdido', 'red'] };
const name = (c) => `${c.first_name} ${c.last_name}`.trim() || c.company_name || c.email || c.phone || c.whatsapp || 'Sin nombre';
const FIELDS = [
  { key: 'first_name', label: 'Nombre' }, { key: 'last_name', label: 'Apellido' }, { key: 'company_name', label: 'Empresa' }, { key: 'phone', label: 'Teléfono' }, { key: 'whatsapp', label: 'WhatsApp (con código de país)' },
  { key: 'email', label: 'Email', type: 'email' }, { key: 'address', label: 'Dirección' }, { key: 'lead_status', label: 'Estado', type: 'select', options: Object.entries(ST).map(([k, v]) => [k, v[0]]) },
  { key: 'tags', label: 'Etiquetas (separadas por coma)' }, { key: 'notes', label: 'Notas', type: 'textarea', rows: 3 },
];
const toBody = (v) => ({ ...v, tags: String(v.tags || '').split(',').map((t) => t.trim()).filter(Boolean) });

export default async function page({ state }) {
  const canW = state.perms.includes('crm:write');
  let status = ''; let q = ''; let tab = 'customers';
  const body = h('div');
  async function load() {
    if (tab === 'leads') {
      const { leads } = await get('/api/leads');
      set(body, h('div', { class: 'card pad0' }, leads.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Cliente', 'Interés', 'Origen', 'Valor', 'Estado', 'Fecha', ''].map((t) => h('th', null, t)))),
        h('tbody', null, leads.map((l) => h('tr', null, h('td', null, h('b', null, l.customer_name || '—')), h('td', null, l.interest || '—'), h('td', null, h('span', { class: 'tag' }, l.source === 'ai' ? `IA · ${l.agent_name || ''}` : l.source)), h('td', null, money(l.value)),
          h('td', null, h('span', { class: 'badge ' + (l.status === 'won' ? 'green' : l.status === 'lost' ? 'red' : 'amber') }, { open: 'Abierto', won: 'Ganado', lost: 'Perdido' }[l.status])), h('td', { class: 'small dim' }, fmtDate(l.created_at)),
          h('td', null, canW && l.status === 'open' ? h('div', { class: 'row-actions' }, h('button', { class: 'btn sm', onclick: async () => { await put('/api/leads/' + l.id, { status: 'won' }); load(); } }, 'Ganado'), h('button', { class: 'btn sm danger', onclick: async () => { await put('/api/leads/' + l.id, { status: 'lost' }); load(); } }, 'Perdido')) : null)))))) : h('div', { class: 'empty' }, h('div', { class: 'ico' }, '🎯'), 'Todavía no hay leads. Los agentes con la acción "Crear lead" los generan solos.')));
      return;
    }
    const d = await get(`/api/customers?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}`);
    const chip = (k, l) => h('button', { class: 'chip' + (status === k ? ' on' : ''), onclick: () => { status = k; load(); } }, l + (k && d.counts[k] ? ` ${d.counts[k]}` : ''));
    set(body, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' } }, h('input', { placeholder: 'Buscar…', value: q, style: { maxWidth: '260px' }, 'aria-label': 'Buscar clientes', onchange: (e) => { q = e.target.value.trim(); load(); } }), chip('', 'Todos'), ...Object.entries(ST).map(([k, v]) => chip(k, v[0]))),
      h('div', { class: 'card pad0' }, d.customers.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Cliente', 'Contacto', 'Estado', 'Último contacto', 'Atendió', ''].map((t) => h('th', null, t)))),
        h('tbody', null, d.customers.map((c) => h('tr', { style: { cursor: 'pointer' }, onclick: () => detail(c.id) }, h('td', null, h('b', null, name(c)), c.tags.length ? h('div', null, c.tags.map((t) => h('span', { class: 'tag', style: { marginRight: '4px' } }, t))) : null),
          h('td', { class: 'small' }, [c.whatsapp || c.phone, c.email].filter(Boolean).join(' · ') || '—'), h('td', null, h('span', { class: 'badge ' + ST[c.lead_status][1] }, ST[c.lead_status][0])), h('td', { class: 'small dim' }, c.last_contact_at ? fmtDate(c.last_contact_at) : '—'), h('td', { class: 'small' }, c.agent_name || '—'), h('td', null, h('span', { class: 'tag' }, c.source))))))) :
        h('div', { class: 'empty' }, h('div', { class: 'ico' }, '👥'), 'No hay clientes con esos filtros.')));
  }
  async function detail(id) {
    const d = await get('/api/customers/' + id); const c = d.customer;
    const dl = h('dl', { class: 'kv' }, ...[['Contacto', [c.phone, c.whatsapp, c.email].filter(Boolean).join(' · ') || '—'], ['Dirección', c.address || '—'], ['Empresa', c.company_name || '—'], ['Origen', c.source], ['Último contacto', c.last_contact_at ? fmtDate(c.last_contact_at) : '—'], ['Última compra', c.last_purchase_at ? fmtDate(c.last_purchase_at) : '—'], ['Notas', c.notes || '—']].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
    modal({ title: name(c), body: h('div', null, h('span', { class: 'badge ' + ST[c.lead_status][1] }, ST[c.lead_status][0]), h('div', { style: { height: '12px' } }), dl,
      h('h3', { style: { margin: '16px 0 6px' } }, 'Historial'), ...[...d.conversations.map((x) => h('div', { class: 'item-row small' }, '💬', h('a', { href: '/conversations' }, `Conversación ${x.channel}`), h('span', { class: 'dim' }, `${x.agent_name} · ${fmtDate(x.last_message_at)}`))),
        ...d.leads.map((x) => h('div', { class: 'item-row small' }, '🎯', `Lead: ${x.interest || '—'}`, h('span', { class: 'dim' }, x.status))), ...d.orders.map((x) => h('div', { class: 'item-row small' }, '🧾', `${x.kind === 'quote' ? 'Presupuesto' : 'Pedido'} ${money(x.total)}`, h('span', { class: 'dim' }, x.status)))],
      !d.conversations.length && !d.leads.length && !d.orders.length ? h('p', { class: 'mute small' }, 'Sin actividad todavía.') : null),
    actions: [{ label: 'Cerrar' }, ...(canW ? [{ label: 'Eliminar', cls: 'danger', run: async () => { if (!(await confirmBox('Eliminar cliente', `Se eliminará ${name(c)}.`, 'Eliminar'))) return false; await del('/api/customers/' + id); navigate('/customers'); } }, { label: 'Editar', cls: 'primary', run: () => { edit(c); } }] : [])] });
  }
  const edit = (c) => formModal({ title: c ? 'Editar cliente' : 'Nuevo cliente', fields: FIELDS, initial: c ? { ...c, tags: c.tags.join(', ') } : { lead_status: 'new' }, onSubmit: async (v) => { if (c) await put('/api/customers/' + c.id, toBody(v)); else await post('/api/customers', toBody(v)); toast('Guardado'); navigate('/customers'); } });
  const tabs = h('div', { class: 'tabs' });
  const paint = () => { set(tabs, ...[['customers', 'Clientes'], ['leads', 'Leads']].map(([k, l]) => h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; paint(); load(); } }, l))); };
  paint(); await load();
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Clientes'), h('p', null, 'CRM básico: contactos, estados e historial.')), canW ? h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => edit(null) }, icon('plus'), 'Nuevo cliente')) : null), tabs, body);
}
