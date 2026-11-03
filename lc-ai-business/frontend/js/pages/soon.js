import { h, icon } from '../dom.js';
const PHASE = { 2: 'CRM, productos, stock, leads y automatizaciones', 3: 'WhatsApp, widget web e integraciones', 4: 'Suscripciones, límites y facturación' };
export default function page({ title, phase, ic }) {
  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), h('p', null, `Disponible en la Fase ${phase}.`))),
    h('div', { class: 'card empty' }, h('div', { class: 'ico', style: { width: '40px', margin: '0 auto 10px', color: 'var(--violet)' } }, icon(ic)),
      h('h2', null, `Próximamente · Fase ${phase}`), h('p', { style: { marginTop: '6px' } }, PHASE[phase]),
      h('p', { class: 'small dim', style: { marginTop: '14px' } }, 'La API ya reserva este módulo y devuelve 501 hasta que se habilite.')));
}
