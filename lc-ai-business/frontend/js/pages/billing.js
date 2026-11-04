import { h, toast, fmtDate, fmtNum, modal, field } from '../dom.js';
import { get, post } from '../api.js';
import { money } from '../forms.js';

const LABEL = { users: 'Usuarios', agents: 'Agentes', documents: 'Documentos', conversations: 'Conversaciones este mes', storage_mb: 'Almacenamiento (MB)', ai_tokens: 'Tokens de IA este mes', ai_budget: 'Gasto de IA este mes' };
const IST = { pending: ['Pendiente', 'amber'], paid: ['Pagada', 'green'], failed: ['Fallida', 'red'], void: ['Anulada', ''] };

export default async function page({ state }) {
  const d = await get('/api/billing'); const canW = state.perms.includes('billing:write');
  const meter = (k) => { const max = d.plan.limits?.[k]; const used = k === 'ai_budget' ? d.usage.ai_cost : d.usage[k]; if (k === 'ai_budget' && (max === undefined || used === undefined)) return null; const unl = max === undefined || max < 0; const pct = unl ? 0 : Math.min(100, (used / Math.max(max, 1)) * 100);
    return h('div', { style: { marginBottom: '14px' } }, h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' } }, h('span', null, LABEL[k]), h('b', null, k === 'ai_budget' ? `${d.usage.currency || 'USD'} ${used.toFixed(2)} / ${unl ? '∞' : max}` : `${fmtNum(used)} / ${unl ? '∞' : fmtNum(max)}`)), h('div', { class: 'meter' + (pct >= 90 ? ' hot' : '') }, h('div', { style: { width: pct + '%' } }))); };
  async function change(p) {
    if (p.price_cents != null && d.online_payments) {
      try { const r = await post('/api/billing/checkout', { planCode: p.code }); window.open(r.url, '_blank', 'noopener'); toast('Abrimos Mercado Pago en otra pestaña. El plan se activa al confirmarse el pago.'); } catch (e) { toast(e.message, true); } return;
    }
    const msg = h('textarea', { rows: 3, maxlength: 500, placeholder: 'Comentarios (opcional)' });
    modal({ title: `Solicitar plan ${p.name}`, body: h('div', null, h('p', { class: 'mute small', style: { marginBottom: '10px' } }, p.price_cents == null ? 'Este plan todavía no tiene precio publicado. LC-SYSTEM se va a contactar con vos.' : 'El cobro online no está disponible: LC-SYSTEM gestiona el cambio.'), field('Mensaje', msg)),
      actions: [{ label: 'Cancelar' }, { label: 'Enviar solicitud', cls: 'primary', run: async () => { try { await post('/api/billing/request-change', { planCode: p.code, message: msg.value }); toast('Solicitud enviada'); } catch (e) { toast(e.message, true); return false; } } }] });
  }
  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Planes y facturación'), h('p', null, `Plan actual: ${d.plan.name || '—'}`, d.subscription ? ` · ${d.subscription.status === 'trialing' ? 'período de prueba' : d.subscription.provider === 'mercadopago' ? 'Mercado Pago' : 'pago manual'}${d.subscription.current_period_end ? ` · próximo vencimiento ${fmtDate(d.subscription.current_period_end)}` : ''}` : ''))),
    h('div', { class: 'card', style: { marginBottom: '16px' } }, h('h3', null, 'Consumo'), h('div', { class: 'grid g-2' }, Object.keys(LABEL).map(meter).filter(Boolean))),
    h('div', { class: 'grid g-stats', style: { marginBottom: '16px' } }, d.plans.map((p) => h('div', { class: 'card plan-card' + (p.code === d.plan.code ? ' cur' : '') }, h('h3', { style: { margin: 0 } }, p.name), h('p', { class: 'mute small' }, p.description),
      h('div', { class: 'price' }, p.price_cents == null ? h('span', { class: 'mute', style: { fontSize: '16px' } }, 'Precio a definir') : [money(p.price_cents / 100, p.currency), h('span', { class: 'small mute' }, ' /mes')]),
      h('ul', { class: 'small mute', style: { paddingLeft: '18px', margin: 0 } }, Object.entries(LABEL).filter(([k]) => p.limits[k] !== undefined).map(([k, l]) => h('li', null, `${l.replace(' este mes', '')}: ${p.limits[k] < 0 ? 'ilimitado' : fmtNum(p.limits[k])}`))),
      p.code === d.plan.code ? h('span', { class: 'badge green' }, 'Plan actual') : canW ? h('button', { class: 'btn', onclick: () => change(p) }, 'Cambiar a este plan') : null))),
    h('div', { class: 'card pad0' }, h('div', { style: { padding: '14px 18px' } }, h('h3', { style: { margin: 0 } }, 'Facturas')),
      d.invoices.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Fecha', 'Concepto', 'Importe', 'Medio', 'Estado'].map((t) => h('th', null, t)))), h('tbody', null, d.invoices.map((i) => h('tr', null, h('td', { class: 'small' }, fmtDate(i.created_at)), h('td', null, i.description), h('td', null, money(i.amount, i.currency)), h('td', null, i.provider === 'mercadopago' ? 'Mercado Pago' : 'Manual'), h('td', null, h('span', { class: 'badge ' + IST[i.status][1] }, IST[i.status][0]))))))) : h('div', { class: 'empty' }, 'Sin facturas todavía.')));
}
