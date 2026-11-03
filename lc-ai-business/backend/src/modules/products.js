'use strict';
const express = require('express');
const multer = require('multer');
const db = require('../db/pool');
const rl = require('../middleware/rateLimit');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { clean } = require('../lib/text');
const { E } = require('../lib/httpError');
const { audit } = require('../lib/audit');
const { upsertProducts } = require('../services/catalog');
const events = require('../services/events');

const router = express.Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const body = z.object({
  sku: str(80), code: str(80), name: str(200, 2), description: z.string().max(2000).transform((v) => clean(v, 2000)), category_id: id.nullable(), category: str(80),
  price: z.number().min(0).max(1e12), stock: z.number().int().min(-1e9).max(1e9), stock_min: z.number().int().min(0).max(1e9), brand: str(120),
  image_url: z.string().trim().max(500).refine((v) => v === '' || /^https?:\/\//i.test(v), 'Debe ser http(s)'), supplier: str(160), status: z.enum(['active', 'inactive']),
}).partial();
const COLS = ['sku', 'code', 'name', 'description', 'category_id', 'price', 'stock', 'stock_min', 'brand', 'image_url', 'supplier', 'status'];

async function categoryId(q, companyId, name) {
  if (!name) return undefined;
  const [c] = await q('INSERT INTO categories (company_id, name) VALUES ($1,$2) ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [companyId, clean(name, 80)]);
  return c.id;
}

router.get('/', requirePerm('catalog:read'), wrap(async (req, res) => {
  const f = parse(z.object({ q: str(100).optional(), category: id.optional(), low: z.enum(['1']).optional(), limit: z.coerce.number().int().min(1).max(200).default(100), offset: z.coerce.number().int().min(0).default(0) }), req.query);
  const out = await db.tenant(req.user.companyId, async (q) => ({
    products: await q(`SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.sku ILIKE '%' || $1 || '%' OR p.brand ILIKE '%' || $1 || '%' OR p.code ILIKE '%' || $1 || '%')
        AND ($2::uuid IS NULL OR p.category_id = $2) AND ($3::boolean IS NOT TRUE OR p.stock <= p.stock_min) ORDER BY p.name LIMIT $4 OFFSET $5`,
    [f.q ? f.q.replace(/[%_\\]/g, '\\$&') : null, f.category || null, f.low === '1', f.limit, f.offset]),
    categories: await q('SELECT id, name FROM categories ORDER BY name'),
    low_stock: (await q('SELECT count(*)::int n FROM products WHERE status = \'active\' AND stock <= stock_min'))[0].n,
  }));
  res.json(out);
}));

router.post('/', requirePerm('catalog:write'), wrap(async (req, res) => {
  const b = parse(body.required({ name: true }), req.body);
  const p = await db.tenant(req.user.companyId, async (q) => {
    const cid = b.category ? await categoryId(q, req.user.companyId, b.category) : b.category_id || null;
    const v = { sku: '', code: '', description: '', price: 0, stock: 0, stock_min: 0, brand: '', image_url: '', supplier: '', status: 'active', ...b, category_id: cid };
    const [r] = await q(`INSERT INTO products (company_id, ${COLS.join(',')}) VALUES ($1,${COLS.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`, [req.user.companyId, ...COLS.map((c) => v[c] ?? null)]);
    return r;
  });
  await audit(req, 'product.create', 'product', p.id);
  if (p.stock <= p.stock_min && p.stock_min > 0) await events.emit(req.user.companyId, 'stock.low', { productId: p.id });
  res.status(201).json({ product: p });
}));

router.put('/:id', requirePerm('catalog:write'), wrap(async (req, res) => {
  const pid = parse(id, req.params.id); const b = parse(body, req.body);
  const prev = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q('SELECT * FROM products WHERE id = $1', [pid]);
    if (!cur) throw E.notFound('Producto no encontrado');
    if (b.category) b.category_id = await categoryId(q, req.user.companyId, b.category);
    const keys = COLS.filter((k) => b[k] !== undefined);
    if (keys.length) await q(`UPDATE products SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [pid, ...keys.map((k) => b[k])]);
    return cur;
  });
  const [p] = await db.tenant(req.user.companyId, (q) => q('SELECT * FROM products WHERE id = $1', [pid]));
  if (p.stock_min > 0 && p.stock <= p.stock_min && prev.stock > prev.stock_min) await events.emit(req.user.companyId, 'stock.low', { productId: p.id });
  await audit(req, 'product.update', 'product', pid);
  res.json({ product: p });
}));

router.delete('/:id', requirePerm('catalog:write'), wrap(async (req, res) => {
  const pid = parse(id, req.params.id);
  const r = await db.tenant(req.user.companyId, (q) => q('DELETE FROM products WHERE id = $1 RETURNING id', [pid]));
  if (!r.length) throw E.notFound('Producto no encontrado');
  await audit(req, 'product.delete', 'product', pid);
  res.json({ ok: true });
}));

// Importación masiva por CSV (cabeceras: sku,nombre,precio,stock,stock_minimo,marca,categoria,proveedor,descripcion,codigo)
router.post('/import', requirePerm('catalog:write'), rl.upload, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw E.badRequest('Falta el archivo CSV (campo "file")');
  const { parseCsv } = require('../services/csv');
  const rows = parseCsv(req.file.buffer.toString('utf8'));
  const map = (r) => ({ sku: r.sku, code: r.codigo || r.code, name: r.nombre || r.name || r.producto, description: r.descripcion || r.description, price: r.precio ?? r.price, stock: r.stock, stock_min: r.stock_minimo ?? r.stock_min, brand: r.marca || r.brand, category: r.categoria || r.category, supplier: r.proveedor || r.supplier });
  const result = await upsertProducts(req.user.companyId, rows.map(map), 'csv');
  await audit(req, 'product.import', 'product', '', { created: result.created, updated: result.updated });
  res.json(result);
}));

module.exports = router;
