import { h, toast, fmtDate, icon, confirmBox, field, modal } from '../dom.js';
import { get, post, put, del } from '../api.js';
import { navigate } from '../main.js';
import { errMsg } from '../forms.js';

const PARAM = { notify: ['title', 'Título de la notificación'], send_message: ['text', 'Mensaje a enviar'], create_lead: ['interest', 'Interés del lead (opcional)'], create_ticket: ['title', 'Título del ticket'], handoff: ['reason', 'Motivo de la derivación'], tag_conversation: ['tag', 'Etiqueta'], set_lead_status: ['status', 'Estado'] };
const STATUSES = [['new', 'Nuevo'], ['contacted', 'Contactado'], ['interested', 'Interesado'], ['quote', 'Presupuesto'], ['customer', 'Cliente'], ['lost', 'Perdido']];
const EXAMPLES = ['Cliente pregunta por precio → responder automáticamente', 'Cliente solicita presupuesto → crear lead', 'Stock bajo → enviar alerta', 'Cliente sin comprar 30 días → crear tarea de seguimiento', 'Conversación complicada → derivar a humano'];

export default async function page({ state }) {
  const canW = state.perms.includes('automations:write');
  const [meta, data] = await Promise.all([get('/api/automations/meta'), get('/api/automations')]);
  const desc = (a) => `${meta.triggers[a.trigger]}${a.conditions?.keywords?.length ? ` (contiene: ${a.conditions.keywords.join(', ')})` : ''}${a.conditions?.days ? ` (${a.conditions.days} días)` : ''} → ${a.actions.map((x) => meta.actions[x.type]).join(' + ')}`;

  function builder() {
    const name = h('input', { maxlength: 120, placeholder: 'Ej: Responder consultas de precio' });
    const trig = h('select', null, Object.entries(meta.triggers).map(([k, l]) => h('option', { value: k }, l)));
    const kw = h('input', { placeholder: 'precio, cuánto cuesta, valor', maxlength: 300 }); const days = h('input', { type: 'number', min: 1, value: 30 });
    const kwF = field('Palabras clave (opcional, separadas por coma)', kw); const dF = field('Días sin comprar', days);
    const cond = h('div'); const upd = () => { cond.replaceChildren(trig.value === 'message.received' ? kwF : trig.value === 'customer.inactive' ? dF : h('span')); }; trig.addEventListener('change', upd); upd();
    const rows = []; const rowsBox = h('div'); const err = h('div', { class: 'alert err', hidden: true });
    function addRow() {
      const type = h('select', null, Object.entries(meta.actions).map(([k, l]) => h('option', { value: k }, l)));
      const param = h('div'); const mk = () => { const [key, label] = PARAM[type.value]; const inp = type.value === 'set_lead_status' ? h('select', null, STATUSES.map(([v, l]) => h('option', { value: v }, l))) : h('input', { placeholder: label, maxlength: 500 }); rec.key = key; rec.inp = inp; param.replaceChildren(inp); };
      const rec = { type, key: '', inp: null }; type.addEventListener('change', mk); mk(); rows.push(rec);
      rowsBox.append(h('div', { class: 'card', style: { padding: '10px', marginBottom: '8px' } }, field('Acción', type), param));
    }
    addRow();
    modal({ title: 'Nueva automatización', body: h('div', null, h('p', { class: 'mute small', style: { marginBottom: '10px' } }, 'SI ocurre algo → ENTONCES hacer algo. Podés usar {{customer.name}} y {{product.name}} en los textos.'), field('Nombre', name), field('SI ocurre…', trig), cond, h('h3', { style: { margin: '6px 0 8px' } }, 'ENTONCES…'), rowsBox, h('button', { class: 'btn sm', type: 'button', onclick: addRow }, '+ Otra acción'), err),
      actions: [{ label: 'Cancelar' }, { label: 'Crear', cls: 'primary', run: async () => {
        err.hidden = true;
        const conditions = {}; if (trig.value === 'message.received' && kw.value.trim()) conditions.keywords = kw.value.split(',').map((s) => s.trim()).filter(Boolean); if (trig.value === 'customer.inactive') conditions.days = Number(days.value) || 30;
        const actions = rows.map((r) => ({ type: r.type.value, [r.key]: r.inp.value }));
        try { await post('/api/automations', { name: name.value, trigger: trig.value, conditions, actions }); toast('Automatización creada'); navigate('/automations'); } catch (e) { err.textContent = errMsg(e); err.hidden = false; return false; }
      } }] });
  }
  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'LC-AI Automations'), h('p', null, 'Reglas SI … ENTONCES … que trabajan solas.')), canW ? h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: builder }, icon('plus'), 'Nueva automatización')) : null),
    data.automations.length ? h('div', { class: 'card pad0' }, data.automations.map((a) => h('div', { class: 'item-row', style: { padding: '14px 18px' } }, h('div', { style: { flex: 1, minWidth: '220px' } }, h('b', null, a.name), h('div', { class: 'small mute' }, desc(a)), h('div', { class: 'small dim' }, `${a.runs} ejecuciones${a.last_run_at ? ` · última ${fmtDate(a.last_run_at)}` : ''}`)),
      canW ? h('div', { class: 'row-actions' }, h('button', { class: 'btn sm', onclick: async () => { await put('/api/automations/' + a.id, { enabled: !a.enabled }); navigate('/automations'); } }, a.enabled ? '● Activa' : '○ Pausada'), h('button', { class: 'btn sm danger', 'aria-label': 'Eliminar', onclick: async () => { if (await confirmBox('Eliminar automatización', `Se eliminará "${a.name}".`, 'Eliminar')) { await del('/api/automations/' + a.id); navigate('/automations'); } } }, icon('trash'))) : h('span', { class: 'badge ' + (a.enabled ? 'green' : '') }, a.enabled ? 'Activa' : 'Pausada')))) :
      h('div', { class: 'card empty' }, h('div', { class: 'ico' }, '⚡'), h('h2', null, 'Todavía no hay automatizaciones'), h('p', { style: { margin: '8px 0' } }, 'Ejemplos:'), h('ul', { style: { listStyle: 'none', padding: 0, color: 'var(--mute)' } }, EXAMPLES.map((e) => h('li', null, e)))),
    data.logs.length ? h('div', { class: 'card pad0', style: { marginTop: '16px' } }, h('div', { style: { padding: '14px 18px' } }, h('h3', { style: { margin: 0 } }, 'Últimas ejecuciones')), h('div', { class: 'table-wrap' }, h('table', null, h('tbody', null, data.logs.map((l) => h('tr', null, h('td', { class: 'small dim' }, fmtDate(l.created_at)), h('td', null, l.automation_name || '—'), h('td', { class: 'small' }, meta.triggers[l.event] || l.event), h('td', null, h('span', { class: 'badge ' + (l.status === 'ok' ? 'green' : 'red') }, l.status === 'ok' ? 'OK' : 'Error')), h('td', { class: 'small mute' }, (l.detail.done || [l.detail.error]).join(', ')))))))) : null);
}
