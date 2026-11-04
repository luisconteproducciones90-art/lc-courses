'use strict';
// Costo estimado de IA. Los precios los carga SUPER ADMIN (USD por millón de tokens, por modelo): no hay
// precios por defecto a propósito, porque cambian y no se deben inventar. Sin precios, el costo es "desconocido".
const db = require('../db/pool');

let cache = { at: 0, value: null };
async function get() {
  if (Date.now() - cache.at < 30000 && cache.value) return cache.value;
  const [row] = await db.system((q) => q("SELECT value FROM settings WHERE company_id IS NULL AND key = 'ai_pricing'"));
  cache = { at: Date.now(), value: row?.value || { currency: 'USD', models: {} } };
  return cache.value;
}
const invalidate = () => { cache = { at: 0, value: null }; };

/** rows: [{model, tin, tout}] → {cost, unpriced} (unpriced: tokens de modelos sin precio cargado) */
function cost(rows, pricing) {
  let total = 0; let unpriced = 0;
  for (const r of rows) {
    const p = pricing.models?.[r.model];
    if (!p) { if (r.model !== 'mock-1') unpriced += r.tin + r.tout; continue; } // el simulado no cuesta
    total += (r.tin * Number(p.in || 0) + r.tout * Number(p.out || 0)) / 1e6;
  }
  return { cost: Math.round(total * 10000) / 10000, unpriced };
}
module.exports = { get, invalidate, cost };
