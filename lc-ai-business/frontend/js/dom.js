// Constructor de DOM seguro: todo texto entra como nodo de texto (nunca innerHTML) → sin XSS.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); // CSP: nada de style="" inline
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const set = (el, ...kids) => append(clear(el), kids);
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k) el.append(k);
  return el;
}
const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z', building: 'M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M15 9h4a1 1 0 011 1v11M8 7h3M8 11h3M8 15h3M2 21h20',
  bot: 'M12 3v3M5 9h14a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2zM8.5 13.5h.01M15.5 13.5h.01M9 17h6',
  chat: 'M21 12a8 8 0 01-11.6 7.1L3 21l1.9-5.4A8 8 0 1121 12z', users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7.5L12 12.5l8.7-5M12 22V12.5', book: 'M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5zM4 19.5V21h16',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7z', chart: 'M3 3v18h18M7 15l4-4 3 3 5-6', plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0zM12 18v4',
  cog: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  card: 'M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2zM2 10h20', shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  plus: 'M12 5v14M5 12h14', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12', play: 'M6 4l14 8-14 8z',
};
export function icon(name) {
  return svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, svg('path', { d: ICONS[name] || ICONS.home }));
}
export function logo(size = 38) {
  const g = svg('linearGradient', { id: 'lg' + size, x1: 0, y1: 0, x2: 1, y2: 1 }, svg('stop', { offset: 0, 'stop-color': '#39ff88' }), svg('stop', { offset: 1, 'stop-color': '#8b5cf6' }));
  const s = svg('svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': 'true' }, svg('defs', {}, g),
    svg('path', { d: 'M32 4l24 14v28L32 60 8 46V18z', fill: '#07080d', stroke: `url(#lg${size})`, 'stroke-width': 4 }),
    svg('path', { d: 'M24 22v20h12M40 24c-3-2-8-1-8 4s5 6 8 4', fill: 'none', stroke: `url(#lg${size})`, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return s;
}

export function toast(msg, isErr) {
  const t = h('div', { class: 'toast' + (isErr ? ' err' : ''), role: 'status' }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), isErr ? 6000 : 3500);
}

export function modal({ title, body, actions = [] }) {
  const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } });
  const close = () => { bg.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  const foot = h('div', { class: 'foot' }, actions.map((a) => h('button', { class: 'btn ' + (a.cls || ''), type: 'button', onclick: async (e) => { e.target.disabled = true; try { const r = await a.run?.(); if (r !== false) close(); } finally { e.target.disabled = false; } } }, a.label)));
  bg.append(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, h('h2', null, title), body, foot));
  document.body.append(bg);
  bg.querySelector('input,textarea,select')?.focus();
  return { close };
}
export const confirmBox = (title, text, label = 'Confirmar') => new Promise((resolve) => {
  modal({ title, body: h('p', { class: 'mute' }, text), actions: [{ label: 'Cancelar', run: () => resolve(false) }, { label, cls: 'danger', run: () => resolve(true) }] });
});

export const fmtDate = (d) => new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fmtNum = (n) => Number(n || 0).toLocaleString('es-AR');
export const initials = (s) => String(s || '?').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

export function field(label, input, hint) {
  return h('label', { class: 'f' }, h('span', null, label), input, hint ? h('em', null, hint) : null);
}
