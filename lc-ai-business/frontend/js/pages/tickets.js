import { h, set, toast, fmtDate, icon } from '../dom.js';
import { get, post, put } from '../api.js';
import { formModal } from '../forms.js';

const PR = { low: ['Baja', ''], normal: ['Normal', 'blue'], high: ['Alta', 'red'] };
const ST = [['open', 'Abierto'], ['in_progress', 'En curso'], ['closed', 'Cerrado']];

export default async function page({ state }) {
  const canW = state.perms.includes('crm:write'); let status = '';
  const body = h('div');
  async function load() {
    const { tickets } = await get('/api/tickets' + (status ? `?status=${status}` : ''));
    set(body, h('div', { style: { display: 'flex', gap: '6px', marginBottom: '14px' } }, h('button', { class: 'chip' + (!status ? ' on' : ''), onclick: () => { status = ''; load(); } }, 'Todos'), ...ST.map(([k, l]) => h('button', { class: 'chip' + (status === k ? ' on' : ''), onclick: () => { status = k; load(); } }, l))),
      h('div', { class: 'card pad0' }, tickets.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Ticket', 'Cliente', 'Prioridad', 'Estado', 'Origen', 'Fecha'].map((t) => h('th', null, t)))),
        h('tbody', null, tickets.map((t) => h('tr', null, h('td', null, h('b', null, t.title), t.description ? h('div', { class: 'small dim' }, t.description.slice(0, 120)) : null), h('td', null, t.customer_name || '—'), h('td', null, h('span', { class: 'badge ' + PR[t.priority][1] }, PR[t.priority][0])),
          h('td', null, canW ? h('select', { 'aria-label': 'Estado', onchange: async (e) => { await put('/api/tickets/' + t.id, { status: e.target.value }); load(); } }, ST.map(([k, l]) => h('option', { value: k, selected: t.status === k }, l))) : t.status), h('td', null, h('span', { class: 'tag' }, t.source)), h('td', { class: 'small dim' }, fmtDate(t.created_at))))))) : h('div', { class: 'empty' }, h('div', { class: 'ico' }, '🎫'), 'No hay tickets.')));
  }
  await load();
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Tickets y tareas'), h('p', null, 'Seguimientos creados por agentes, automatizaciones o personas.')),
    canW ? h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => formModal({ title: 'Nuevo ticket', fields: [{ key: 'title', label: 'Título', required: true }, { key: 'description', label: 'Descripción', type: 'textarea', rows: 3 }, { key: 'priority', label: 'Prioridad', type: 'select', options: [['low', 'Baja'], ['normal', 'Normal'], ['high', 'Alta']] }], initial: { priority: 'normal' }, onSubmit: async (v) => { await post('/api/tickets', v); toast('Ticket creado'); load(); } }) }, icon('plus'), 'Nuevo ticket')) : null), body);
}
