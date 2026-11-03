import { h, set, toast, fmtDate, icon } from '../dom.js';
import { get, post, put } from '../api.js';
import { formModal, money } from '../forms.js';
import { navigate } from '../main.js';

const OS = { pending: ['Pendiente', 'amber'], confirmed: ['Confirmado', 'green'], delivered: ['Entregado', 'blue'], cancelled: ['Cancelado', 'red'] };
const summary = (pa) => { const i = pa.input || {}; if (i.items) return i.items.map((x) => `${x.qty}× ${x.sku || x.name}`).join(', '); return i.interest || i.title || ''; };

export default async function page({ state }) {
  const canW = state.perms.includes('crm:write'); const canA = state.perms.includes('approvals:decide');
  let tab = 'approvals';
  const body = h('div');
  const tabs = h('div', { class: 'tabs' });
  async function load() {
    if (tab === 'approvals') {
      const { approvals } = await get('/api/approvals'); const pend = approvals.filter((a) => a.status === 'pending');
      set(body, pend.length ? h('div', { class: 'grid g-2' }, pend.map((a) => h('div', { class: 'card' }, h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('b', null, a.tool_label), h('span', { class: 'badge amber right' }, 'Pendiente')),
        h('p', { class: 'mute small', style: { margin: '6px 0' } }, `Agente ${a.agent_name || ''} · ${fmtDate(a.created_at)}`), h('p', null, summary(a)), h('p', { class: 'small dim', style: { margin: '8px 0 12px' } }, 'El precio final lo calcula el sistema desde tu catálogo.'),
        canA ? h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', onclick: async () => { const r = await post(`/api/approvals/${a.id}/approve`); toast(r.ok ? 'Aprobada' : `No se pudo ejecutar: ${r.result?.error || ''}`, !r.ok); load(); } }, 'Aprobar'), h('button', { class: 'btn danger', onclick: async () => { await post(`/api/approvals/${a.id}/reject`); toast('Rechazada'); load(); } }, 'Rechazar')) : null))) :
        h('div', { class: 'card empty' }, h('div', { class: 'ico' }, '✅'), h('h2', null, 'Sin aprobaciones pendientes'), h('p', { style: { marginTop: '6px' } }, 'Cuando un agente proponga un presupuesto o pedido, aparece acá para que lo apruebes.')),
      approvals.some((a) => a.status !== 'pending') ? h('div', { class: 'card pad0', style: { marginTop: '16px' } }, h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Acción', 'Detalle', 'Resultado', 'Fecha'].map((t) => h('th', null, t)))), h('tbody', null, approvals.filter((a) => a.status !== 'pending').slice(0, 15).map((a) => h('tr', null, h('td', null, a.tool_label), h('td', { class: 'small' }, summary(a)), h('td', null, h('span', { class: 'badge ' + (a.status === 'approved' ? 'green' : 'red') }, a.status === 'approved' ? 'Aprobada' : 'Rechazada')), h('td', { class: 'small dim' }, fmtDate(a.decided_at || a.created_at)))))))) : null);
    } else {
      const { orders } = await get('/api/orders');
      set(body, h('div', { class: 'card pad0' }, orders.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Tipo', 'Cliente', 'Ítems', 'Total', 'Estado', 'Origen', 'Fecha'].map((t) => h('th', null, t)))),
        h('tbody', null, orders.map((o) => h('tr', null, h('td', null, h('span', { class: 'tag' }, o.kind === 'quote' ? 'Presupuesto' : 'Pedido')), h('td', null, o.customer_name || '—'), h('td', { class: 'small' }, o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')), h('td', null, h('b', null, money(o.total))),
          h('td', null, canW ? h('select', { 'aria-label': 'Estado', onchange: async (e) => { try { await put('/api/orders/' + o.id, { status: e.target.value }); toast('Estado actualizado'); load(); } catch (x) { toast(x.message, true); load(); } } }, Object.entries(OS).map(([k, v]) => h('option', { value: k, selected: o.status === k }, v[0]))) : h('span', { class: 'badge ' + OS[o.status][1] }, OS[o.status][0])),
          h('td', null, h('span', { class: 'tag' }, o.source)), h('td', { class: 'small dim' }, fmtDate(o.created_at))))))) : h('div', { class: 'empty' }, h('div', { class: 'ico' }, '🧾'), 'Todavía no hay presupuestos ni pedidos.')));
    }
  }
  const paint = () => set(tabs, ...[['approvals', 'Aprobaciones'], ['orders', 'Presupuestos y pedidos']].map(([k, l]) => h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; paint(); load(); } }, l)));
  paint(); await load();
  const newOrder = () => formModal({ title: 'Nuevo presupuesto / pedido', fields: [{ key: 'kind', label: 'Tipo', type: 'select', options: [['quote', 'Presupuesto'], ['order', 'Pedido']] }, { key: 'lines', label: 'Ítems (uno por línea: SKU cantidad)', type: 'textarea', rows: 4, hint: 'Ej: TAL-650 2' }, { key: 'notes', label: 'Notas' }], initial: { kind: 'quote' },
    onSubmit: async (v) => { const items = v.lines.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.+?)\s+(\d+)$/); return { sku: (m ? m[1] : l).trim(), qty: m ? Number(m[2]) : 1 }; }); await post('/api/orders', { kind: v.kind, items, notes: v.notes }); toast('Creado'); tab = 'orders'; paint(); load(); } });
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Pedidos y aprobaciones'), h('p', null, 'Las acciones de IA con efecto esperan tu aprobación antes de ejecutarse.')), canW ? h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: newOrder }, icon('plus'), 'Nuevo')) : null), tabs, body);
}
