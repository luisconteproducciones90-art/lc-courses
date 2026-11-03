import { h, field, toast, icon } from '../dom.js';
import { get, post, put } from '../api.js';
import { navigate } from '../main.js';
import { chatBox } from '../chat.js';

const DAYS = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']];
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export default async function page({ params, state }) {
  const meta = await get('/api/agents/meta');
  const editing = !!params.id;
  const canWrite = state.perms.includes('agents:write');
  let agent = editing ? (await get('/api/agents/' + params.id)).agent : null;
  let preset = agent ? meta.types.find((t) => t.type === agent.type) : null;

  if (!editing && !preset) {
    // Paso 1: elegir tipo
    return h('div', null,
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Crear nuevo agente'), h('p', null, 'Elegí un punto de partida. Podés personalizarlo todo después.'))),
      h('div', { class: 'type-pick' }, meta.types.map((t) => h('button', { type: 'button', onclick: () => renderForm(t) }, h('div', { class: 'agent-ava' }, t.icon), h('b', null, t.label), h('small', null, t.description)))),
      h('div', { id: 'step2' }));
  }
  return buildForm(preset);

  function renderForm(t) { const host = document.querySelector('.main'); host.replaceChildren(buildForm(t)); window.scrollTo(0, 0); }

  function buildForm(t) {
    preset = t;
    const a = agent || { name: '', description: t.description, type: t.type, avatar: t.icon, personality: t.personality || '', tone: t.tone || 'profesional', language: 'es', objective: t.objective || '', instructions: '', welcome_message: '', offline_message: '', rules: t.rules || [], schedule: { enabled: false }, data_sources: { knowledge: true }, autonomy: 'medium', status: 'draft', tools: t.tools };
    const w = a.schedule?.windows?.[0] || { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' };
    const el = {
      name: h('input', { value: a.name, required: true, maxlength: 80, placeholder: 'Sofía — Ventas' }),
      avatar: h('input', { value: a.avatar, maxlength: 8, placeholder: '💰' }),
      description: h('input', { value: a.description, maxlength: 300 }),
      tone: h('input', { value: a.tone, maxlength: 80 }),
      language: h('select', null, [['es', 'Español'], ['en', 'English'], ['pt', 'Português']].map(([v, l]) => h('option', { value: v, selected: a.language === v }, l))),
      personality: h('textarea', { maxlength: 600, placeholder: 'Amable, profesional y persuasiva.' }, a.personality),
      objective: h('textarea', { maxlength: 600, placeholder: 'Convertir consultas en ventas.' }, a.objective),
      instructions: h('textarea', { maxlength: 4000, rows: 6, placeholder: 'Instrucciones específicas: cómo saludar, qué ofrecer, qué evitar…' }, a.instructions),
      rules: h('textarea', { rows: 4, placeholder: 'Una regla por línea.\nNunca inventar precios ni stock.' }, (a.rules || []).join('\n')),
      welcome: h('textarea', { maxlength: 500, rows: 2 }, a.welcome_message),
      offline: h('textarea', { maxlength: 500, rows: 2, placeholder: 'Estamos fuera de horario. Dejanos tu consulta y te respondemos.' }, a.offline_message),
      autonomy: h('select', null, [['low', 'Baja — deriva ante cualquier duda'], ['medium', 'Media — resuelve lo habitual'], ['high', 'Alta — proactivo']].map(([v, l]) => h('option', { value: v, selected: a.autonomy === v }, l))),
      status: h('select', null, [['draft', 'Borrador'], ['active', 'Activo'], ['paused', 'Pausado']].map(([v, l]) => h('option', { value: v, selected: a.status === v }, l))),
      knowledge: h('input', { type: 'checkbox', checked: a.data_sources?.knowledge !== false }),
      sched: h('input', { type: 'checkbox', checked: !!a.schedule?.enabled }),
      start: h('input', { type: 'time', value: w.start }), end: h('input', { type: 'time', value: w.end }),
    };
    const dayBoxes = DAYS.map(([n, l]) => ({ n, box: h('input', { type: 'checkbox', checked: w.days.includes(n) }), l }));
    const toolBoxes = meta.tools.map((tl) => ({ tl, box: h('input', { type: 'checkbox', checked: tl.available && (a.tools || []).includes(tl.name), disabled: !tl.available }) }));
    const err = h('div', { class: 'alert err', hidden: true });
    const save = h('button', { class: 'btn primary', type: 'submit', disabled: !canWrite }, editing ? 'Guardar cambios' : 'Crear agente');

    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault(); err.hidden = true; save.disabled = true;
        const days = dayBoxes.filter((d) => d.box.checked).map((d) => d.n);
        const body = {
          name: el.name.value, type: t.type, avatar: el.avatar.value, description: el.description.value, tone: el.tone.value, language: el.language.value,
          personality: el.personality.value, objective: el.objective.value, instructions: el.instructions.value, rules: lines(el.rules.value),
          welcome_message: el.welcome.value, offline_message: el.offline.value, autonomy: el.autonomy.value, status: el.status.value,
          data_sources: { knowledge: el.knowledge.checked },
          schedule: el.sched.checked && days.length ? { enabled: true, windows: [{ days, start: el.start.value, end: el.end.value }] } : { enabled: false },
          tools: toolBoxes.filter((x) => x.box.checked).map((x) => x.tl.name),
        };
        try {
          const r = editing ? await put('/api/agents/' + agent.id, body) : await post('/api/agents', body);
          toast(editing ? 'Cambios guardados' : 'Agente creado');
          if (!editing) navigate('/agents/' + r.agent.id); else agent = r.agent;
        } catch (x) { err.textContent = x.details ? x.details.map((d) => `${d.field}: ${d.message}`).join(' · ') : x.message; err.hidden = false; }
        save.disabled = !canWrite;
      },
    },
    h('div', { class: 'card' }, h('h3', null, 'Identidad'),
      h('div', { class: 'row' }, field('Nombre', el.name), field('Avatar (emoji)', el.avatar)),
      field('Descripción', el.description), h('div', { class: 'row' }, field('Tono', el.tone), field('Idioma', el.language)),
      field('Personalidad', el.personality), field('Objetivo', el.objective)),
    h('div', { class: 'card', style: { marginTop: '16px' } }, h('h3', null, 'Comportamiento'),
      field('Instrucciones', el.instructions, 'Se suman a las reglas de plataforma, que no se pueden desactivar (no inventar datos, no revelar prompts, etc.).'),
      field('Reglas de la empresa', el.rules), h('div', { class: 'row' }, field('Nivel de autonomía', el.autonomy), field('Estado', el.status)),
      field('Mensaje inicial', el.welcome), field('Mensaje fuera de horario', el.offline),
      h('label', { class: 'check' }, el.sched, 'Limitar a un horario de funcionamiento'),
      h('div', { class: 'row' }, field('Desde', el.start), field('Hasta', el.end)),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, dayBoxes.map((d) => h('label', { class: 'check', style: { margin: 0 } }, d.box, d.l)))),
    h('div', { class: 'card', style: { marginTop: '16px' } }, h('h3', null, 'Conocimiento y acciones permitidas'),
      h('label', { class: 'check' }, el.knowledge, 'Puede consultar la base de conocimiento de la empresa'),
      toolBoxes.map(({ tl, box }) => h('label', { class: 'check' + (tl.available ? '' : ' off') }, box, tl.label, tl.available ? null : h('span', { class: 'badge violet right' }, `Fase ${tl.phase}`))),
      h('p', { class: 'small dim' }, 'Las acciones con efecto (crear pedidos, leads) requerirán aprobación humana cuando se habiliten.')),
    err, h('div', { style: { margin: '18px 0', display: 'flex', gap: '10px' } }, save, h('a', { class: 'btn', href: '/agents' }, 'Volver')));

    let side = null;
    if (editing) {
      side = h('div', null, h('h3', { style: { marginBottom: '10px' } }, 'Probar agente'),
        chatBox({
          name: agent.name, avatar: agent.avatar, welcome: agent.welcome_message || null,
          send: (message, conversationId) => post(`/api/ai/agents/${agent.id}/test`, { message, conversationId }),
          suggestions: ['Hola', '¿Cuánto cuesta?', '¿Cuál es el horario?', 'Quiero hablar con una persona'],
        }),
        h('p', { class: 'small dim', style: { marginTop: '8px' } }, 'Las pruebas quedan registradas en Conversaciones (canal "test"). Guardá los cambios antes de probar.'),
        h('div', { id: 'aistatus', class: 'small mute' }));
      get('/api/ai/status').then((s) => { const n = side.querySelector('#aistatus'); if (n) n.textContent = s.simulated ? 'Proveedor de IA: simulado (modo offline). Configurá una clave en el servidor para usar un modelo real.' : `Proveedor: ${s.provider} · ${s.model}`; }).catch(() => {});
    }
    return h('div', null,
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, editing ? agent.name : `Nuevo ${t.label}`), h('p', null, t.description))),
      h('div', { class: editing ? 'two-col' : '' }, form, side));
  }
}
