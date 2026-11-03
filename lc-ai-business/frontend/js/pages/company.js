import { h, field, toast } from '../dom.js';
import { get, put } from '../api.js';

const GROUPS = [
  ['Datos generales', [['name', 'Nombre comercial'], ['legal_name', 'Razón social'], ['tax_id', 'CUIT'], ['address', 'Dirección'], ['phone', 'Teléfono'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['website', 'Web (https://…)'], ['instagram', 'Instagram'], ['facebook', 'Facebook']]],
  ['Marca', [['logo_url', 'URL del logo'], ['brand_primary', 'Color principal', 'color'], ['brand_secondary', 'Color secundario', 'color']]],
];
const LONG = [['description', 'Descripción', 1500], ['business_hours', 'Horarios', 600], ['services', 'Servicios', 2500], ['products_info', 'Productos', 2500], ['faq', 'Preguntas frecuentes', 4000], ['policies', 'Políticas', 3000], ['commercial_info', 'Información comercial', 2500]];

export default async function page({ state }) {
  const { company: c } = await get('/api/companies/current');
  const can = state.perms.includes('company:update');
  const inputs = {};
  const mk = (k, type) => (inputs[k] = h('input', { type: type || 'text', value: c[k] || '', disabled: !can, maxlength: 300 }));
  const err = h('div', { class: 'alert err', hidden: true });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    try { const body = {}; for (const [k, i] of Object.entries(inputs)) body[k] = i.value; const r = await put('/api/companies/current', body); state.company.name = r.company.name; toast('Datos guardados'); }
    catch (x) { err.textContent = x.details ? x.details.map((d) => `${d.field}: ${d.message}`).join(' · ') : x.message; err.hidden = false; }
  } },
  GROUPS.map(([t, fs]) => h('div', { class: 'card', style: { marginBottom: '16px' } }, h('h3', null, t), h('div', { class: 'row' }, fs.map(([k, l, ty]) => field(l, mk(k, ty)))))),
  h('div', { class: 'card' }, h('h3', null, 'Contexto para tus agentes'), h('p', { class: 'mute small', style: { marginBottom: '12px' } }, 'Esta información se usa como contexto de todos los agentes IA.'),
    LONG.map(([k, l, m]) => field(l, (inputs[k] = h('textarea', { rows: 3, maxlength: m, disabled: !can }, c[k] || ''))))),
  err, can ? h('button', { class: 'btn primary', style: { margin: '16px 0' }, type: 'submit' }, 'Guardar') : null);
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Mi empresa'), h('p', null, `Plan ${c.plan_name || '—'} · ID público del widget: `, h('code', { class: 'mono' }, c.public_key)))), form);
}
