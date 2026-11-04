import { h, set, field, toast, modal, confirmBox, fmtDate, icon } from '../dom.js';
import { get, post, del, api } from '../api.js';
import { navigate } from '../main.js';

const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export default async function page({ state }) {
  const canWrite = state.perms.includes('knowledge:write');
  const [{ documents, supported }, { agents }, st] = await Promise.all([get('/api/documents'), get('/api/agents'), get('/api/knowledge/status')]);
  const agentSel = () => h('select', null, h('option', { value: '' }, 'Todos los agentes'), agents.map((a) => h('option', { value: a.id }, a.name)));

  function addText() {
    const title = h('input', { maxlength: 160, placeholder: 'Ej: Política de cambios' }); const content = h('textarea', { rows: 8, placeholder: 'Pegá acá el texto: preguntas frecuentes, políticas, precios…' }); const ag = agentSel();
    modal({ title: 'Agregar texto', body: h('div', null, field('Título', title), field('Contenido', content), field('Disponible para', ag)),
      actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async () => { try { await post('/api/documents/text', { title: title.value, content: content.value, agentId: ag.value || null }); toast('Texto agregado'); navigate('/knowledge'); } catch (e) { toast(e.details ? e.details.map((d) => d.message).join(', ') : e.message, true); return false; } } }] });
  }
  function upload() {
    const file = h('input', { type: 'file', accept: '.txt,.md,.csv,.pdf' }); const title = h('input', { maxlength: 160, placeholder: 'Opcional' }); const ag = agentSel();
    modal({ title: 'Subir documento', body: h('div', null, field('Archivo', file, `Formatos: ${supported.join(', ').toUpperCase()} · máx. 5 MB. DOCX, XLSX e imágenes llegan en la Fase 2.`), field('Título', title), field('Disponible para', ag)),
      actions: [{ label: 'Cancelar' }, { label: 'Procesar', cls: 'primary', run: async () => {
        if (!file.files[0]) { toast('Elegí un archivo', true); return false; }
        const fd = new FormData(); fd.append('file', file.files[0]); if (title.value) fd.append('title', title.value); if (ag.value) fd.append('agentId', ag.value);
        try { await api('POST', '/api/documents/upload', fd); toast('Documento procesado'); navigate('/knowledge'); } catch (e) { toast(e.message, true); return false; }
      } }] });
  }

  const q = h('input', { placeholder: 'Ej: ¿cuánto cuesta el taladro?', maxlength: 200 }); const out = h('div', { style: { marginTop: '12px' } });
  const test = h('form', { onsubmit: async (e) => {
    e.preventDefault(); if (q.value.trim().length < 2) return;
    try { const r = await get('/api/knowledge/search?q=' + encodeURIComponent(q.value)); set(out, r.results.length ? r.results.map((x) => h('div', { class: 'alert' }, h('b', null, x.title), ' ', (x.via || []).map((v) => h('span', { class: 'badge ' + (v === 'palabras' ? 'blue' : 'violet'), style: { marginLeft: '4px' } }, v)), h('div', { class: 'small mute', style: { whiteSpace: 'pre-wrap', marginTop: '4px' } }, x.content.slice(0, 400)))) : h('p', { class: 'mute small' }, 'El agente no encontraría nada para esa consulta (respondería que no tiene la información).')); } catch (x) { toast(x.message, true); }
  } }, h('div', { style: { display: 'flex', gap: '8px' } }, q, h('button', { class: 'btn', type: 'submit' }, 'Buscar')));

  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Base de conocimiento'), h('p', null, 'Lo que tus agentes saben sobre tu negocio.')),
      canWrite ? h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: addText }, icon('plus'), 'Pegar texto'), h('button', { class: 'btn primary', onclick: upload }, icon('upload'), 'Subir documento')) : null),
    h('div', { class: 'alert' + (st.indexed < st.total ? '' : ' ok'), style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
      h('div', { style: { flex: 1, minWidth: '240px' } }, h('b', null, st.semantic ? 'Búsqueda semántica activa' : 'Búsqueda por palabras con tolerancia a errores'), h('div', { class: 'small mute' }, st.semantic ? `Entiende sinónimos y paráfrasis (${st.model}).` : 'Tolera errores de tipeo, plurales y acentos. Para entender sinónimos, SUPER ADMIN puede activar un proveedor de embeddings.', ` Fragmentos indexados: ${st.indexed}/${st.total}.`)),
      canWrite && st.indexed < st.total ? h('button', { class: 'btn', onclick: async (e) => { e.target.disabled = true; e.target.textContent = 'Indexando…'; try { const r = await post('/api/knowledge/reindex'); toast(`Índice actualizado: ${r.reindexed} fragmentos`); } catch (x) { toast(x.message, true); } navigate('/knowledge'); } }, 'Actualizar índice') : null),
    h('div', { class: 'card pad0', style: { marginTop: '14px' } }, documents.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Documento', 'Tipo', 'Agente', 'Fragmentos', 'Estado', 'Fecha', ''].map((t) => h('th', null, t)))),
      h('tbody', null, documents.map((d) => h('tr', null, h('td', null, h('b', null, d.title), h('div', { class: 'small dim' }, d.filename ? `${d.filename} · ${kb(d.size_bytes)}` : kb(d.size_bytes))), h('td', null, h('span', { class: 'tag' }, d.source_type === 'file' ? d.filename.split('.').pop() : 'texto')),
        h('td', null, d.agent_name || 'Todos'), h('td', { class: 'mono' }, d.chunk_count), h('td', null, h('span', { class: 'badge ' + (d.status === 'ready' ? 'green' : d.status === 'failed' ? 'red' : 'amber') }, d.status === 'ready' ? 'Listo' : d.status === 'failed' ? 'Error' : 'Procesando')),
        h('td', { class: 'small dim' }, fmtDate(d.created_at)), h('td', null, canWrite ? h('button', { class: 'btn sm danger', 'aria-label': 'Eliminar', onclick: async () => { if (await confirmBox('Eliminar documento', `Se eliminará "${d.title}" del conocimiento.`, 'Eliminar')) { await del('/api/documents/' + d.id); navigate('/knowledge'); } } }, icon('trash')) : null)))))) :
      h('div', { class: 'empty' }, h('div', { class: 'ico' }, '📚'), h('h2', null, 'Aún no cargaste conocimiento'), h('p', { style: { marginTop: '6px' } }, 'Subí listas de precios, catálogos, políticas o preguntas frecuentes para que tus agentes respondan con datos reales.'))),
    h('div', { class: 'card', style: { marginTop: '16px' } }, h('h3', null, '🔎 Probar búsqueda'), h('p', { class: 'mute small', style: { marginBottom: '10px' } }, 'Verificá qué fragmentos encontraría un agente para una pregunta.'), test, out));
}
