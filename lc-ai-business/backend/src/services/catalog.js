'use strict';
// Alta/actualización masiva de productos por SKU (CSV, API externa, conectores).
const db = require('../db/pool');
const { clean } = require('../lib/text');
const events = require('./events');

const num = (v, d = 0) => { const n = Number(String(v ?? '').replace(/\./g, (m, o, s) => (s.includes(',') ? '' : m)).replace(',', '.')); return Number.isFinite(n) ? n : d; };

async function upsertProducts(companyId, rows, source = 'api') {
  const res = { created: 0, updated: 0, skipped: 0, errors: [] }; const lows = [];
  await db.tenant(companyId, async (q) => {
    for (const [i, r] of rows.slice(0, 5000).entries()) {
      const name = clean(r.name || '', 200); const sku = clean(r.sku || '', 80);
      if (!name || (!sku && !r.external_ref)) { res.skipped += 1; if (res.errors.length < 20) res.errors.push(`fila ${i + 2}: falta nombre o sku`); continue; }
      await q('SAVEPOINT row_sp');
      try {
        let catId = null;
        if (r.category) { const [c] = await q('INSERT INTO categories (company_id, name) VALUES ($1,$2) ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [companyId, clean(r.category, 80)]); catId = c.id; }
        const given = (v) => v !== undefined && v !== null && String(v).trim() !== '';
        const price = given(r.price) ? Math.max(0, num(r.price)) : null; const stock = given(r.stock) ? Math.trunc(num(r.stock)) : null; const min = given(r.stock_min) ? Math.max(0, Math.trunc(num(r.stock_min))) : null;
        const [ex] = await q('SELECT id, stock, stock_min FROM products WHERE sku = $1 AND $1 <> \'\'', [sku]);
        if (ex) {
          await q(`UPDATE products SET name = $2, description = COALESCE(NULLIF($3,''), description), price = COALESCE($4, price), stock = COALESCE($5, stock), stock_min = COALESCE($6, stock_min), brand = COALESCE(NULLIF($7,''), brand), supplier = COALESCE(NULLIF($8,''), supplier),
            category_id = COALESCE($9, category_id), code = COALESCE(NULLIF($10,''), code), external_ref = COALESCE(NULLIF($11,''), external_ref) WHERE id = $1`,
          [ex.id, name, clean(r.description || '', 2000), price, stock, min, clean(r.brand || '', 120), clean(r.supplier || '', 160), catId, clean(r.code || '', 80), clean(r.external_ref || '', 120)]);
          res.updated += 1; const ns = stock ?? ex.stock; const nm = min ?? ex.stock_min; if (nm > 0 && ns <= nm && ex.stock > ex.stock_min) lows.push(ex.id);
        } else {
          const [p] = await q('INSERT INTO products (company_id, sku, code, name, description, category_id, price, stock, stock_min, brand, supplier, external_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
            [companyId, sku, clean(r.code || '', 80), name, clean(r.description || '', 2000), catId, price ?? 0, stock ?? 0, min ?? 0, clean(r.brand || '', 120), clean(r.supplier || '', 160), clean(r.external_ref || '', 120)]);
          res.created += 1; if ((min ?? 0) > 0 && (stock ?? 0) <= min) lows.push(p.id);
        }
        await q('RELEASE SAVEPOINT row_sp');
      } catch (e) { await q('ROLLBACK TO SAVEPOINT row_sp'); res.skipped += 1; if (res.errors.length < 20) res.errors.push(`fila ${i + 2}: ${e.message.slice(0, 80)}`); }
    }
  });
  for (const productId of lows) await events.emit(companyId, 'stock.low', { productId, source });
  return res;
}
module.exports = { upsertProducts, num };
