import { h, toast, modal } from '../dom.js';
import { get, post } from '../api.js';
import { navigate } from '../main.js';

export default async function page({ state }) {
  const { templates } = await get('/api/marketplace'); const canW = state.perms.includes('agents:write');
  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'LC-AI Marketplace'), h('p', null, 'Agentes listos para tu rubro: instalá, completá tus datos y empezá a atender.'))),
    h('div', { class: 'grid g-3' }, templates.map((t) => h('div', { class: 'card tpl' }, h('div', { class: 'ico' }, t.icon), h('div', null, h('h3', { style: { margin: 0 } }, t.name), h('span', { class: 'tag' }, t.industry)), h('p', { class: 'mute small', style: { flex: 1 } }, t.description),
      h('div', { class: 'small dim mono' }, `${t.docs} doc. inicial${t.docs === 1 ? '' : 'es'} · ${t.installs} instalaciones`),
      canW ? h('button', { class: 'btn primary', onclick: async (e) => {
        e.target.disabled = true;
        try { const r = await post(`/api/marketplace/${t.slug}/install`); modal({ title: '¡Agente instalado!', body: h('div', null, h('p', { class: 'mute', style: { marginBottom: '10px' } }, `Se creó "${r.agent.name}" como borrador con ${r.documents} documento(s) de ejemplo.`), h('h3', null, 'Próximos pasos'), h('ol', { style: { color: 'var(--mute)', paddingLeft: '20px' } }, r.next_steps.map((s) => h('li', null, s)))), actions: [{ label: 'Ir al agente', cls: 'primary', run: () => navigate('/agents/' + r.agent.id) }] }); }
        catch (x) { toast(x.message, true); } finally { e.target.disabled = false; }
      } }, t.installed ? 'Instalar otra vez' : 'Instalar') : null))));
}
