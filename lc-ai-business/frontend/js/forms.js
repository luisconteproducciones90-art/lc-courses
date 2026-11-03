import { h, modal, toast, field } from './dom.js';

// Modal de formulario declarativo. fields: [{key,label,type,options,hint,placeholder,required,value}]
// onSubmit(values) puede lanzar: se muestra el error y el modal queda abierto.
export function formModal({ title, fields, initial = {}, submitLabel = 'Guardar', onSubmit, wide }) {
  const inputs = {};
  const err = h('div', { class: 'alert err', hidden: true });
  const body = h('div', null, fields.map((f) => {
    const v = initial[f.key] ?? f.value ?? '';
    let el;
    if (f.type === 'select') el = h('select', null, f.options.map(([val, lab]) => h('option', { value: val, selected: String(v) === String(val) }, lab)));
    else if (f.type === 'textarea') el = h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '', maxlength: f.max || 4000 }, v);
    else if (f.type === 'checkbox') { el = h('input', { type: 'checkbox', checked: !!v }); inputs[f.key] = { el, f }; return h('label', { class: 'check' }, el, f.label); }
    else el = h('input', { type: f.type || 'text', value: v, placeholder: f.placeholder || '', maxlength: f.max || 300, step: f.step, min: f.min, required: !!f.required });
    inputs[f.key] = { el, f };
    return field(f.label, el, f.hint);
  }), err);
  const read = () => Object.fromEntries(Object.entries(inputs).map(([k, { el, f }]) => [k, f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value]));
  return modal({ title, body, actions: [{ label: 'Cancelar' }, { label: submitLabel, cls: 'primary', run: async () => {
    err.hidden = true;
    try { await onSubmit(read()); return true; } catch (e) { err.textContent = e.details?.length ? e.details.map((d) => `${d.field ? d.field + ': ' : ''}${d.message}`).join(' · ') : e.message; err.hidden = false; return false; }
  } }] });
}

export const copyBtn = (text, label = 'Copiar') => h('button', { class: 'btn sm', type: 'button', onclick: async (e) => {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); e.target.textContent = '✓ Copiado'; } catch { toast('Seleccioná el texto y copialo manualmente', true); }
} }, label);

export const money = (n, cur = 'ARS') => new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(n) || 0);
export const errMsg = (e) => (e.details?.length ? e.details.map((d) => d.message).join(', ') : e.message);
export const secure = (msg, text) => h('div', { class: 'alert ok' }, msg, h('pre', { class: 'mono', style: { margin: '8px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', userSelect: 'all' } }, text), copyBtn(text));
