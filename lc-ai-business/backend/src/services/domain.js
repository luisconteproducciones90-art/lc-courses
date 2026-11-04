'use strict';
// Operaciones de negocio compartidas por rutas, herramientas de IA y automatizaciones.
// Todas reciben q = consulta con contexto de tenant (db.tenant): RLS garantiza el aislamiento.
const { E } = require('../lib/httpError');
const { clean } = require('../lib/text');

const notify = (q, companyId, { title, body = '', level = 'info', link = '' }) =>
  q('INSERT INTO notifications (company_id, title, body, level, link) VALUES ($1,$2,$3,$4,$5)', [companyId, clean(title, 160), clean(body, 500), level, link]);

function splitName(full) {
  const parts = clean(full, 120).split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
}

/** Busca por whatsapp/teléfono/email; si no existe lo crea. Devuelve {customer, created}. */
async function upsertCustomer(q, companyId, d) {
  const phone = clean(d.phone || '', 40); const wa = clean(d.whatsapp || '', 40); const email = clean(d.email || '', 200).toLowerCase();
  const ext = clean(d.externalRef || '', 120);
  let [c] = ext ? await q('SELECT * FROM customers WHERE external_ref = $1 LIMIT 1', [ext]) : [];
  if (!c) [c] = await q(
    `SELECT * FROM customers WHERE ($1 <> '' AND (whatsapp = $1 OR phone = $1)) OR ($2 <> '' AND (phone = $2 OR whatsapp = $2)) OR ($3 <> '' AND lower(email) = $3) LIMIT 1`, [wa, phone, email]);
  if (c) {
    const { first, last } = splitName(d.name || '');
    [c] = await q(`UPDATE customers SET external_ref = CASE WHEN external_ref = '' THEN $7 ELSE external_ref END, first_name = CASE WHEN first_name = '' THEN $2 ELSE first_name END, last_name = CASE WHEN last_name = '' THEN $3 ELSE last_name END,
      email = CASE WHEN email = '' THEN $4 ELSE email END, phone = CASE WHEN phone = '' THEN $5 ELSE phone END, whatsapp = CASE WHEN whatsapp = '' THEN $6 ELSE whatsapp END WHERE id = $1 RETURNING *`,
    [c.id, first, last, email, phone, wa, ext]);
    return { customer: c, created: false };
  }
  const { first, last } = splitName(d.name || '');
  [c] = await q(`INSERT INTO customers (company_id, first_name, last_name, phone, whatsapp, email, source, external_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [companyId, first, last, phone, wa, email, d.source || 'ai', ext]);
  return { customer: c, created: true };
}

async function linkCustomer(q, conversationId, customerId, agentId) {
  if (!conversationId || !customerId) return;
  await q('UPDATE conversations SET customer_id = $2, contact_name = CASE WHEN contact_name = \'\' OR contact_name LIKE \'Visitante%\' THEN (SELECT trim(first_name || \' \' || last_name) FROM customers WHERE id = $2) ELSE contact_name END WHERE id = $1', [conversationId, customerId]);
  await q('UPDATE customers SET last_contact_at = now(), last_agent_id = COALESCE($2, last_agent_id) WHERE id = $1', [customerId, agentId || null]);
}

async function createLead(q, companyId, d) {
  const [lead] = await q('INSERT INTO leads (company_id, customer_id, conversation_id, agent_id, source, interest, value) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [companyId, d.customerId || null, d.conversationId || null, d.agentId || null, d.source || 'ai', clean(d.interest || '', 500), Number(d.value) || 0]);
  if (d.customerId) await q("UPDATE customers SET lead_status = CASE WHEN lead_status IN ('new','contacted') THEN 'interested' ELSE lead_status END WHERE id = $1", [d.customerId]);
  return lead;
}

async function createTicket(q, companyId, d) {
  const [t] = await q('INSERT INTO tickets (company_id, customer_id, conversation_id, agent_id, title, description, priority, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [companyId, d.customerId || null, d.conversationId || null, d.agentId || null, clean(d.title, 160), clean(d.description || '', 2000), ['low', 'normal', 'high'].includes(d.priority) ? d.priority : 'normal', d.source || 'ai']);
  return t;
}

/** Resuelve ítems contra el catálogo. Los PRECIOS siempre salen de la base, nunca del cliente ni del modelo. */
async function priceItems(q, items, { checkStock }) {
  const out = []; let total = 0;
  for (const it of items) {
    const qty = Math.max(1, Math.min(10000, Math.floor(Number(it.qty) || 1)));
    const ref = clean(it.sku || it.name || '', 120);
    if (!ref) throw E.badRequest('Cada ítem necesita sku o nombre');
    const rows = await q(`SELECT * FROM products WHERE status = 'active' AND (lower(sku) = lower($1) OR name ILIKE '%' || $2 || '%') ORDER BY (lower(sku) = lower($1)) DESC, name LIMIT 2`, [ref, ref.replace(/[%_\\]/g, '\\$&')]);
    if (!rows.length) throw E.badRequest(`No encontré el producto "${ref}" en el catálogo`);
    if (rows.length > 1 && rows[0].sku.toLowerCase() !== ref.toLowerCase()) throw E.badRequest(`"${ref}" coincide con varios productos; indicá el SKU`);
    const p = rows[0];
    if (checkStock && p.stock < qty) throw E.conflict(`Stock insuficiente de ${p.name} (disponible: ${p.stock})`);
    const line = Math.round(Number(p.price) * qty * 100) / 100;
    total += line;
    out.push({ product_id: p.id, sku: p.sku, name: p.name, qty, unit_price: Number(p.price), subtotal: line });
  }
  return { items: out, total: Math.round(total * 100) / 100 };
}

async function createOrder(q, companyId, d) {
  const priced = await priceItems(q, d.items, { checkStock: d.kind === 'order' });
  const [o] = await q('INSERT INTO orders (company_id, kind, customer_id, conversation_id, agent_id, items, total, notes, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [companyId, d.kind, d.customerId || null, d.conversationId || null, d.agentId || null, JSON.stringify(priced.items), priced.total, clean(d.notes || '', 1000), d.source || 'ai']);
  return o;
}

const stockLabel = (p) => (p.stock <= 0 ? 'sin stock' : p.stock <= Math.max(p.stock_min, 0) ? 'últimas unidades' : 'disponible');

module.exports = { notify, upsertCustomer, linkCustomer, createLead, createTicket, createOrder, priceItems, stockLabel, splitName };
