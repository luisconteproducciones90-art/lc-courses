import { h, svg } from './dom.js';

// Gráficos SVG propios (sin librerías externas → CSP estricta).
export function lineChart(points, { height = 190, label = '' } = {}) {
  const W = 600; const H = height; const pad = { l: 30, r: 10, t: 12, b: 24 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i) => pad.l + (points.length === 1 ? 0 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const id = 'gl' + Math.random().toString(36).slice(2, 7);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  const el = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label },
    svg('defs', {}, svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, svg('stop', { offset: 0, 'stop-color': '#39ff88', 'stop-opacity': '.35' }), svg('stop', { offset: 1, 'stop-color': '#8b5cf6', 'stop-opacity': '0' }))));
  [0, 0.5, 1].forEach((t) => {
    el.append(svg('line', { class: 'grid-l', x1: pad.l, x2: W - pad.r, y1: pad.t + t * (H - pad.t - pad.b), y2: pad.t + t * (H - pad.t - pad.b) }));
    const tx = svg('text', { x: 2, y: pad.t + t * (H - pad.t - pad.b) + 3 }); tx.textContent = Math.round(max * (1 - t)); el.append(tx);
  });
  el.append(svg('path', { d: area, fill: `url(#${id})` }), svg('path', { d: line, fill: 'none', stroke: '#39ff88', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
  points.forEach((p, i) => {
    const c = svg('circle', { cx: x(i), cy: y(p.value), r: 3, fill: '#07080d', stroke: '#39ff88', 'stroke-width': 1.5 });
    const t = svg('title'); t.textContent = `${p.label}: ${p.value}`; c.append(t); el.append(c);
    if (i % Math.ceil(points.length / 6) === 0) { const tx = svg('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }); tx.textContent = p.label; el.append(tx); }
  });
  return el;
}

export function columnChart(points, { height = 170, label = '' } = {}) {
  const W = 600; const H = height; const pad = { l: 24, r: 6, t: 8, b: 22 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const bw = (W - pad.l - pad.r) / points.length;
  const el = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  el.append(svg('line', { class: 'grid-l', x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b }));
  points.forEach((p, i) => {
    const bh = (p.value / max) * (H - pad.t - pad.b);
    const r = svg('rect', { x: pad.l + i * bw + 2, y: H - pad.b - bh, width: Math.max(2, bw - 4), height: bh, rx: 2, fill: p.value === max && p.value > 0 ? '#39ff88' : '#8b5cf6', opacity: p.value ? 1 : 0.25 });
    const t = svg('title'); t.textContent = `${p.label}: ${p.value}`; r.append(t); el.append(r);
    if (i % 3 === 0) { const tx = svg('text', { x: pad.l + i * bw + bw / 2, y: H - 6, 'text-anchor': 'middle' }); tx.textContent = p.label; el.append(tx); }
  });
  return el;
}

export function barList(items) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return h('p', { class: 'mute small' }, 'Sin datos todavía.');
  return h('div', { class: 'bars' }, items.map((i) => h('div', { class: 'bar-row' }, h('span', { title: i.label }, i.label), h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${(i.value / max) * 100}%` } })), h('b', null, i.value))));
}
