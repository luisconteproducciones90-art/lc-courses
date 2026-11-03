'use strict';
// Conector REST genérico: trae productos/stock desde un sistema externo (LC-SYSTEM BUSINESS, LC-ECOMMERCE,
// LC-PEDIDOS u otra API) mapeando campos. No asume ninguna API concreta: todo es configurable.
const db = require('../db/pool');
const { safeFetch } = require('../lib/ssrf');
const { decryptJson } = require('../lib/crypto');
const { upsertProducts } = require('./catalog');
const log = require('../lib/logger');

const PRESETS = {
  'lc-system-business': { label: 'LC-SYSTEM BUSINESS', products_path: '/api/products' },
  'lc-ecommerce': { label: 'LC-ECOMMERCE', products_path: '/api/products' },
  'lc-pedidos': { label: 'LC-PEDIDOS', products_path: '/api/products' },
  'lc-previews': { label: 'LC-PREVIEWS', products_path: '/api/products' },
  custom: { label: 'API externa', products_path: '/products' },
};
const FIELDS = ['sku', 'name', 'price', 'stock', 'stock_min', 'brand', 'category', 'supplier', 'description', 'code'];
const dig = (o, path) => String(path || '').split('.').filter(Boolean).reduce((x, k) => (x == null ? undefined : x[k]), o);

async function syncProducts(companyId, integ) {
  const cfg = integ.config; const sec = decryptJson(integ.secrets);
  const headers = { accept: 'application/json', 'user-agent': 'LC-AI-BUSINESS-Connector/1.0' };
  if (sec.token) headers[cfg.auth_type === 'header' ? (cfg.auth_header || 'x-api-key') : 'authorization'] = cfg.auth_type === 'header' ? sec.token : `Bearer ${sec.token}`;
  const map = { sku: 'sku', name: 'name', price: 'price', stock: 'stock', ...(cfg.field_map || {}) };
  const all = [];
  for (let page = 1; page <= (cfg.paginate ? 20 : 1); page += 1) {
    const url = `${cfg.base_url.replace(/\/$/, '')}${cfg.products_path || '/products'}${cfg.paginate ? `?page=${page}` : ''}`;
    const r = await safeFetch(url, { headers, timeoutMs: 15000, maxBytes: 5 * 1024 * 1024 });
    if (r.status !== 200) throw new Error(`El sistema externo respondió ${r.status}`);
    let json; try { json = JSON.parse(r.body.toString('utf8')); } catch { throw new Error('Respuesta no es JSON'); }
    const list = cfg.items_path ? dig(json, cfg.items_path) : json;
    if (!Array.isArray(list)) throw new Error('No se encontró la lista de productos (revisá "items_path")');
    if (!list.length) break;
    for (const it of list) all.push(Object.fromEntries([...FIELDS.map((f) => [f, dig(it, map[f])]), ['external_ref', String(dig(it, map.external_ref || map.sku) ?? '')]]));
    if (all.length >= 5000) break;
  }
  return upsertProducts(companyId, all, 'connector');
}

async function runSync(companyId, integId) {
  const [integ] = await db.tenant(companyId, (q) => q('SELECT * FROM integrations WHERE id = $1', [integId]));
  if (!integ) throw require('../lib/httpError').E.notFound('Integración no encontrada');
  try {
    const res = await syncProducts(companyId, integ);
    await db.tenant(companyId, (q) => q("UPDATE integrations SET status = 'active', config = config || $2::jsonb WHERE id = $1", [integId, JSON.stringify({ last_sync_at: new Date().toISOString(), last_result: res, last_error: '' })]));
    return res;
  } catch (e) {
    await db.tenant(companyId, (q) => q("UPDATE integrations SET status = 'error', config = config || $2::jsonb WHERE id = $1", [integId, JSON.stringify({ last_error: String(e.message).slice(0, 200) })]));
    throw e;
  }
}

/** Sincronización automática (cada 30 min) de conectores con auto_sync. */
async function runAutoSyncs() {
  const rows = await db.system((q) => q("SELECT id, company_id FROM integrations WHERE provider LIKE 'rest:%' AND status <> 'disabled' AND config->>'auto_sync' = 'true'"));
  let n = 0;
  for (const r of rows) { try { await runSync(r.company_id, r.id); n += 1; } catch (e) { log.warn('autosync failed', { err: e.message }); } }
  return n;
}
module.exports = { PRESETS, runSync, runAutoSyncs, FIELDS };
