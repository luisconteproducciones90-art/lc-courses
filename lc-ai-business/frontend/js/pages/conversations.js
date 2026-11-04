import { h, set, fmtDate, toast, field } from '../dom.js';
import { get, post, put } from '../api.js';
import { onLeave } from '../main.js';

export const CSTATUS = { ai: ['IA atendiendo', 'green'], waiting_customer: ['Esperando cliente', 'blue'], needs_human: ['Requiere humano', 'red'], closed: ['Finalizada', ''] };
const badge = (s) => h('span', { class: 'badge ' + CSTATUS[s][1] }, CSTATUS[s][0]);

export default async function page({ state }) {
  const canReply = state.perms.includes('conversations:reply');
  let filter = ''; let search = ''; let selected = null; let data = { conversations: [], counts: {} }; let detail = null;
  const inbox = h('div', { class: 'inbox' });
  const listCol = h('div', { class: 'col-list' });
  const mainWrap = h('div', { class: 'col-main-wrap conv-main', style: { display: 'flex', flexDirection: 'column' } });
  const infoCol = h('div', { class: 'col-info' });
  inbox.append(listCol, mainWrap, infoCol);

  async function loadList() {
    const qs = new URLSearchParams(); if (filter) qs.set('status', filter); if (search) qs.set('q', search);
    data = await get('/api/conversations?' + qs); drawList();
  }
  function drawList() {
    const chip = (k, l) => h('button', { class: 'chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; loadList(); } }, l + (k && data.counts[k] ? ` ${data.counts[k]}` : ''));
    const s = h('input', { placeholder: 'Buscar…', value: search, 'aria-label': 'Buscar conversaciones', style: { padding: '6px 10px' }, onchange: (e) => { search = e.target.value.trim(); loadList(); } });
    set(listCol, h('div', { class: 'filters' }, s, chip('', 'Todas'), chip('needs_human', 'Requiere humano'), chip('ai', 'IA'), chip('waiting_customer', 'Esperando'), chip('closed', 'Finalizadas')),
      data.conversations.length ? data.conversations.map((c) => h('button', { class: 'conv' + (c.id === selected ? ' on' : ''), onclick: () => open(c.id) },
        h('div', { class: 't' }, h('b', null, c.contact_name || 'Visitante'), h('span', { class: 'small dim right' }, fmtDate(c.last_message_at))),
        h('p', null, c.last_message || '—'), h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' } }, badge(c.status), h('span', { class: 'small dim' }, `${c.agent_avatar || ''} ${c.agent_name}`), h('span', { class: 'chan right' }, { widget: '🌐 web', whatsapp: '💬 whatsapp', instagram: '📸 instagram', facebook: '💙 messenger', email: '✉️ email', demo: 'demo', test: 'prueba' }[c.channel] || c.channel)))) : h('div', { class: 'empty' }, h('div', { class: 'ico' }, '💬'), 'No hay conversaciones todavía.', h('p', { class: 'small', style: { marginTop: '6px' } }, 'Probá un agente en Agentes → Probar, o la demo pública.')));
  }
  async function open(id) {
    selected = id; detail = await get('/api/conversations/' + id); drawList(); drawMain(); inbox.classList.add('show-chat');
  }
  async function act(name) { await post(`/api/conversations/${selected}/${name}`); await refresh(); }
  async function refresh() { await loadList(); if (selected) { detail = await get('/api/conversations/' + selected); drawMain(); } }

  function drawMain() {
    if (!detail) { set(mainWrap, h('div', { class: 'empty', style: { margin: 'auto' } }, 'Elegí una conversación')); set(infoCol, ); return; }
    const c = detail.conversation; const closed = c.status === 'closed';
    const body = h('div', { class: 'chat-body' }, detail.messages.map((m) => h('div', { class: 'msg ' + m.role }, m.role === 'human' ? h('b', { class: 'small' }, (m.user_name || 'Equipo') + ' · ') : null, m.content, h('small', null, fmtDate(m.created_at)))));
    const input = h('input', { placeholder: c.mode === 'ai' ? 'Escribir tomará el control de la conversación…' : 'Responder al cliente…', maxlength: 4000, disabled: !canReply || closed });
    const form = h('form', { class: 'chat-in', onsubmit: async (e) => { e.preventDefault(); const v = input.value.trim(); if (!v) return; input.value = ''; try { await post(`/api/conversations/${selected}/messages`, { content: v }); await refresh(); } catch (x) { toast(x.message, true); } } }, input, h('button', { class: 'btn primary', disabled: !canReply || closed }, 'Enviar'));
    set(mainWrap, 
      h('div', { class: 'chat-head' }, h('button', { class: 'btn sm back-btn', onclick: () => inbox.classList.remove('show-chat') }, '←'), h('div', null, h('b', null, c.contact_name || 'Visitante'), h('div', { class: 'small dim' }, `${c.agent_name} · canal ${c.channel}`)), h('span', { class: 'right' }, badge(c.status))),
      body, form);
    body.scrollTop = body.scrollHeight;

    const tagInput = h('input', { placeholder: 'etiqueta1, etiqueta2', value: c.tags.join(', '), disabled: !canReply, onchange: async (e) => { const tags = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); try { await put(`/api/conversations/${selected}/tags`, { tags }); toast('Etiquetas guardadas'); } catch (x) { toast(x.message, true); } } });
    const noteIn = h('textarea', { rows: 2, placeholder: 'Nota interna (el cliente no la ve)', maxlength: 2000, disabled: !canReply });
    set(infoCol, 
      h('h3', null, 'Conversación'),
      h('div', { class: 'small mute', style: { display: 'grid', gap: '4px', marginBottom: '14px' } }, h('div', null, 'Atiende: ', h('b', { style: { color: 'var(--text)' } }, c.mode === 'ai' ? '🤖 IA' : `👤 ${c.assigned_name || 'Persona'}`)), c.handoff_reason ? h('div', null, 'Motivo de derivación: ', c.handoff_reason) : null, h('div', null, 'Inicio: ', fmtDate(c.created_at))),
      canReply ? h('div', { style: { display: 'grid', gap: '8px', marginBottom: '16px' } },
        c.mode === 'ai' ? h('button', { class: 'btn', disabled: closed, onclick: () => act('take') }, '✋ Tomar control') : h('button', { class: 'btn', disabled: closed, onclick: () => act('release') }, '🤖 Devolver a la IA'),
        closed ? h('button', { class: 'btn', onclick: () => act('reopen') }, 'Reabrir') : h('button', { class: 'btn danger', onclick: () => act('close') }, 'Finalizar')) : null,
      field('Etiquetas', tagInput),
      h('h3', { style: { margin: '14px 0 8px' } }, 'Notas'),
      detail.notes.map((n) => h('div', { class: 'alert', style: { padding: '8px 10px' } }, n.body, h('div', { class: 'small dim' }, `${n.user_name || ''} · ${fmtDate(n.created_at)}`))),
      noteIn, canReply ? h('button', { class: 'btn sm', style: { marginTop: '6px' }, onclick: async () => { const v = noteIn.value.trim(); if (!v) return; await post(`/api/conversations/${selected}/notes`, { body: v }); await refresh(); } }, 'Agregar nota') : null);
  }

  await loadList(); drawMain();
  const timer = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 6000);
  onLeave(() => clearInterval(timer));
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Centro de conversaciones'), h('p', null, 'Atendé, tomá el control o devolvé la conversación a la IA.'))), inbox);
}
