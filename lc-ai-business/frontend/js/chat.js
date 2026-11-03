import { h } from './dom.js';

// Caja de chat reutilizable (prueba de agentes y demo). send(texto, conversationId) → {reply, conversationId, status}
export function chatBox({ name, avatar, welcome, send, placeholder = 'Escribí tu mensaje…', suggestions = [] }) {
  let convId = null; let busy = false;
  const body = h('div', { class: 'chat-body', 'aria-live': 'polite' });
  const input = h('input', { placeholder, maxlength: 400, 'aria-label': 'Mensaje', autocomplete: 'off' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Enviar');
  const add = (role, text) => { const m = h('div', { class: 'msg ' + role }, text); body.append(m); body.scrollTop = body.scrollHeight; return m; };
  if (welcome) add('ai', welcome);
  async function submit(text) {
    text = (text ?? input.value).trim();
    if (!text || busy) return;
    busy = true; btn.disabled = true; input.value = '';
    add('customer', text);
    const typing = h('div', { class: 'typing', 'aria-label': 'Escribiendo' }, h('i'), h('i'), h('i')); body.append(typing); body.scrollTop = body.scrollHeight;
    try {
      const r = await send(text, convId);
      convId = r.conversationId;
      typing.remove();
      if (r.reply) add('ai', r.reply); else add('system', 'Una persona del equipo continuará esta conversación.');
      if (r.status === 'needs_human' && r.reply) add('system', '↪ Conversación derivada a una persona');
    } catch (e) { typing.remove(); add('system', '⚠ ' + e.message); }
    busy = false; btn.disabled = false; input.focus();
  }
  const sugg = suggestions.length ? h('div', { class: 'sugg', style: { padding: '0 12px 10px' } }, suggestions.map((s) => h('button', { class: 'chip', type: 'button', onclick: () => submit(s) }, s))) : null;
  const root = h('div', { class: 'chatbox' },
    h('div', { class: 'chat-head' }, h('div', { class: 'agent-ava', style: { width: '36px', height: '36px', fontSize: '18px' } }, avatar && !avatar.startsWith('http') ? avatar : '🤖'), h('div', null, h('b', null, name), h('div', { class: 'small', style: { color: 'var(--green)' } }, '● en línea')),
      h('button', { class: 'btn sm ghost right', type: 'button', onclick: () => { convId = null; body.replaceChildren(); if (welcome) add('ai', welcome); } }, 'Reiniciar')),
    body, sugg, h('form', { class: 'chat-in', onsubmit: (e) => { e.preventDefault(); submit(); } }, input, btn));
  return root;
}
