import { h, set, toast, modal, confirmBox, icon, field } from '../dom.js';
import { get, post, put, del, api } from '../api.js';
import { formModal, money } from '../forms.js';
import { navigate } from '../main.js';

const FIELDS = (cats) => [
  { key: 'name', label: 'Nombre', required: true }, { key: 'sku', label: 'SKU' }, { key: 'code', label: 'Código' }, { key: 'brand', label: 'Marca' },
  { key: 'category', label: 'Categoría', hint: `Existentes: ${cats.map((c) => c.name).join(', ') || 'ninguna'}` }, { key: 'price', label: 'Precio', type: 'number', step: '0.01', min: 0 },
  { key: 'stock', label: 'Stock', type: 'number' }, { key: 'stock_min', label: 'Stock mínimo', type: 'number', min: 0 }, { key: 'supplier', label: 'Proveedor' }, { key: 'image_url', label: 'URL de imagen (https://…)' },
  { key: 'description', label: 'Descripción', type: 'textarea', rows: 3 }, { key: 'status', label: 'Estado', type: 'select', options: [['active', 'Activo'], ['inactive', 'Inactivo']] },
];
const stockBadge = (p) => (p.stock <= 0 ? h('span', { class: 'badge red' }, 'Sin stock') : p.stock <= p.stock_min ? h('span', { class: 'badge amber' }, `Bajo · ${p.stock}`) : h('span', { class: 'badge green' }, p.stock));

export default async function page({ state }) {
  const canW = state.perms.includes('catalog:write');
  let q = ''; let low = false;
  const body = h('div');
  let cats = [];
  async function load() {
    const d = await get(`/api/products?${new URLSearchParams({ ...(q ? { q } : {}), ...(low ? { low: '1' } : {}) })}`); cats = d.categories;
    set(body, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' } }, h('input', { placeholder: 'Buscar por nombre, SKU o marca…', value: q, style: { maxWidth: '320px' }, 'aria-label': 'Buscar productos', onchange: (e) => { q = e.target.value.trim(); load(); } }),
      h('button', { class: 'chip' + (low ? ' on' : ''), onclick: () => { low = !low; load(); } }, `Stock bajo ${d.low_stock}`)),
    h('div', { class: 'card pad0' }, d.products.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Producto', 'SKU', 'Categoría', 'Precio', 'Stock', 'Estado', ''].map((t) => h('th', null, t)))),
      h('tbody', null, d.products.map((p) => h('tr', null, h('td', null, h('b', null, p.name), h('div', { class: 'small dim' }, [p.brand, p.supplier].filter(Boolean).join(' · '))), h('td', { class: 'mono small' }, p.sku || '—'), h('td', null, p.category || '—'), h('td', null, money(p.price)), h('td', null, stockBadge(p)),
        h('td', null, h('span', { class: 'badge ' + (p.status === 'active' ? 'green' : '') }, p.status === 'active' ? 'Activo' : 'Inactivo')),
        h('td', null, canW ? h('div', { class: 'row-actions' }, h('button', { class: 'btn sm', onclick: () => edit(p) }, 'Editar'), h('button', { class: 'btn sm danger', 'aria-label': 'Eliminar', onclick: async () => { if (await confirmBox('Eliminar producto', `Se eliminará "${p.name}".`, 'Eliminar')) { await del('/api/products/' + p.id); load(); } } }, icon('trash'))) : null)))))) :
      h('div', { class: 'empty' }, h('div', { class: 'ico' }, '📦'), h('h2', null, 'No hay productos'), h('p', { style: { marginTop: '6px' } }, 'Cargalos a mano, importá un CSV o conectá tu sistema desde Integraciones.'))));
  }
  const edit = (p) => formModal({ title: p ? 'Editar producto' : 'Nuevo producto', fields: FIELDS(cats), initial: p ? { ...p, price: Number(p.price) } : { status: 'active', price: 0, stock: 0, stock_min: 0 },
    onSubmit: async (v) => { const b = { ...v, price: v.price ?? 0, stock: v.stock ?? 0, stock_min: v.stock_min ?? 0 }; if (!b.category) delete b.category; if (p) await put('/api/products/' + p.id, b); else await post('/api/products', b); toast('Guardado'); load(); } });
  function importCsv() {
    const file = h('input', { type: 'file', accept: '.csv' }); const out = h('div');
    modal({ title: 'Importar productos (CSV)', body: h('div', null, h('p', { class: 'mute small', style: { marginBottom: '10px' } }, 'Cabeceras: ', h('code', { class: 'mono' }, 'sku, nombre, precio, stock, stock_minimo, marca, categoria, proveedor, descripcion, codigo'), '. Separador coma o punto y coma. Se actualiza por SKU y los campos vacíos no se pisan.'), field('Archivo', file), out),
      actions: [{ label: 'Cerrar' }, { label: 'Importar', cls: 'primary', run: async () => {
        if (!file.files[0]) { toast('Elegí un archivo', true); return false; }
        const fd = new FormData(); fd.append('file', file.files[0]);
        try { const r = await api('POST', '/api/products/import', fd); set(out, h('div', { class: 'alert ok' }, `${r.created} creados · ${r.updated} actualizados · ${r.skipped} omitidos`, r.errors.length ? h('div', { class: 'small', style: { marginTop: '6px' } }, r.errors.join(' | ')) : null)); load(); } catch (e) { toast(e.message, true); }
        return false;
      } }] });
  }
  await load();
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Productos y stock'), h('p', null, 'Los agentes consultan este catálogo para dar precios y disponibilidad reales.')),
    canW ? h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: importCsv }, icon('upload'), 'Importar CSV'), h('button', { class: 'btn primary', onclick: () => edit(null) }, icon('plus'), 'Nuevo producto')) : null), body);
}
