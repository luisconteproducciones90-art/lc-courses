'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { start, Client, db } = require('./helpers');
const automations = require('../src/services/automations');

let server; let base; let C; let D; let root; let cid; let agent;
const text = async (c, content, convId) => (await c.post(`/api/ai/agents/${agent.id}/test`, { message: content, conversationId: convId })).body;

before(async () => {
  ({ server, base } = await start());
  C = new Client(base); D = new Client(base); root = new Client(base);
  await C.register('Ferretería Gamma', 'gamma@test.com'); await D.register('Boutique Delta', 'delta@test.com'); await root.login('root@lc.test', 'SuperSecreta123');
  cid = (await C.get('/api/auth/me')).body.company.id;
  await root.req('PATCH', `/api/admin/companies/${cid}`, { planCode: 'enterprise' });
  agent = (await C.post('/api/agents', { name: 'Sofía', type: 'sales', status: 'active' })).body.agent;
});
after(async () => { server.close(); await db.close(); });

test('productos: CRUD, importación CSV (coma decimal y ;), búsqueda, aislamiento', async () => {
  const p = await C.post('/api/products', { name: 'Taladro percutor 650W', sku: 'TAL-650', brand: 'Bosch', price: 89900, stock: 12, stock_min: 3, category: 'Herramientas' });
  assert.equal(p.status, 201);
  assert.equal((await C.post('/api/products', { name: 'Dup', sku: 'TAL-650' })).status, 409);
  const csv = 'sku;nombre;precio;stock;stock_minimo;marca;categoria\nMAR-1;Martillo 500g;5.800,50;40;5;Stanley;Herramientas\nSER-2;Serrucho;7000;2;5;Tramontina;Herramientas\n;sin sku;10;1;0;x;y\n';
  const fd = new FormData(); fd.append('file', new Blob([csv]), 'productos.csv');
  const imp = await C.req('POST', '/api/products/import', fd);
  assert.equal(imp.status, 200, imp.text);
  assert.equal(imp.body.created, 2); assert.equal(imp.body.skipped, 1);
  const list = await C.get('/api/products?q=martillo');
  assert.equal(list.body.products.length, 1); assert.equal(Number(list.body.products[0].price), 5800.5);
  assert.equal((await C.get('/api/products?low=1')).body.products.length, 1); // serrucho: 2 <= 5
  assert.deepEqual((await D.get('/api/products')).body.products, []);
  assert.equal((await D.put(`/api/products/${p.body.product.id}`, { price: 1 })).status, 404);
  const up = await C.put(`/api/products/${p.body.product.id}`, { price: 91000 });
  assert.equal(Number(up.body.product.price), 91000);
  assert.equal((await C.post('/api/products', { name: 'x', price: -5 })).status, 400);
});

test('conocimiento: DOCX, XLSX y URL bloqueada por SSRF', async () => {
  const docx = zipSync({ 'word/document.xml': strToU8('<w:document><w:body><w:p><w:r><w:t>La garantía del taladro es de 18 meses &amp; cubre fallas.</w:t></w:r></w:p></w:body></w:document>') });
  const fd = new FormData(); fd.append('file', new Blob([docx]), 'garantia.docx');
  assert.equal((await C.req('POST', '/api/documents/upload', fd)).status, 201);
  const xlsx = zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Lista" sheetId="1"/></sheets></workbook>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>producto</t></si><si><t>precio</t></si><si><t>Amoladora</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>78900</v></c></row></sheetData></worksheet>'),
  });
  const fd2 = new FormData(); fd2.append('file', new Blob([xlsx]), 'lista.xlsx');
  assert.equal((await C.req('POST', '/api/documents/upload', fd2)).status, 201);
  const s = await C.get('/api/knowledge/search?q=' + encodeURIComponent('garantía taladro meses'));
  assert.ok(s.body.results.some((r) => /18 meses & cubre/.test(r.content)));
  const s2 = await C.get('/api/knowledge/search?q=amoladora');
  assert.ok(s2.body.results.some((r) => /Amoladora,78900/.test(r.content)));
  const fdBad = new FormData(); fdBad.append('file', new Blob(['PK-no-es-zip']), 'roto.docx');
  assert.equal((await C.req('POST', '/api/documents/upload', fdBad)).status, 415);
  for (const url of ['http://127.0.0.1:4000/', 'http://169.254.169.254/latest/meta-data/', 'http://localhost/', 'file:///etc/passwd', 'http://[::1]/', 'http://user:pw@example.com/']) {
    const r = await C.post('/api/documents/url', { url });
    assert.ok([400].includes(r.status), `${url} -> ${r.status}`);
  }
});

test('IA con catálogo: precios y stock reales, nunca inventados', async () => {
  const r1 = await text(C, '¿Cuánto cuesta el taladro Bosch?');
  assert.match(r1.reply, /91\.000/); assert.match(r1.reply, /disponible/);
  const r2 = await text(C, '¿Tenés lijadora industrial?');
  assert.doesNotMatch(r2.reply, /\$\d/);
  const r3 = await text(C, '¿Hay serrucho?');
  assert.match(r3.reply, /últimas unidades/);
});

let quoteConv;
test('acciones con efecto: presupuesto queda pendiente, se aprueba y el precio sale de la base', async () => {
  const r = await text(C, 'Necesito un presupuesto de 3 taladro');
  quoteConv = r.conversationId;
  assert.match(r.reply, /pendiente/);
  assert.equal((await C.get('/api/orders')).body.orders.length, 0);
  const pend = (await C.get('/api/approvals')).body.approvals.filter((a) => a.status === 'pending');
  assert.equal(pend.length, 1); assert.equal(pend[0].tool, 'create_quote');
  const ap = await C.post(`/api/approvals/${pend[0].id}/approve`);
  assert.equal(ap.status, 200); assert.equal(ap.body.ok, true);
  const o = (await C.get('/api/orders')).body.orders[0];
  assert.equal(o.kind, 'quote'); assert.equal(Number(o.total), 273000); // 3 × 91.000 calculado por el servidor
  assert.equal((await C.post(`/api/approvals/${pend[0].id}/approve`)).status, 404); // no se puede aprobar dos veces
  // rechazo
  await text(C, 'Necesito un presupuesto de 1 martillo');
  const p2 = (await C.get('/api/approvals')).body.approvals.find((a) => a.status === 'pending');
  await C.post(`/api/approvals/${p2.id}/reject`);
  assert.equal((await C.get('/api/orders')).body.orders.length, 1);
  assert.equal((await D.get('/api/approvals')).body.approvals.length, 0);
  assert.equal((await D.post(`/api/approvals/${p2.id}/approve`)).status, 404);
  // sin aprobación requerida: pedido directo valida stock
  await C.put(`/api/agents/${agent.id}`, { tools: ['search_knowledge', 'query_products', 'create_order', 'handoff_to_human'], approvals: [] });
  const bad = await text(C, 'Quiero comprar 500 martillo');
  assert.match(bad.reply, /Stock insuficiente/);
  const ok = await text(C, 'Quiero comprar 2 martillo');
  assert.match(ok.reply, /11\.601/); // 2 × 5.800,50
});

test('pedidos: confirmar descuenta stock; ganar un lead marca al cliente', async () => {
  const orders = (await C.get('/api/orders')).body.orders;
  const order = orders.find((o) => o.kind === 'order');
  const before = (await C.get('/api/products?q=martillo')).body.products[0].stock;
  assert.equal((await C.put(`/api/orders/${order.id}`, { status: 'confirmed' })).status, 200);
  assert.equal((await C.get('/api/products?q=martillo')).body.products[0].stock, before - 2);
  const man = await C.post('/api/orders', { kind: 'order', items: [{ sku: 'SER-2', qty: 99 }] });
  assert.equal(man.status, 409, man.text);
});

test('leads por IA, CRM y tickets', async () => {
  await C.put(`/api/agents/${agent.id}`, { tools: ['search_knowledge', 'create_lead', 'create_ticket', 'handoff_to_human'] });
  const r = await text(C, 'Hola, me llamo Ana Pérez, mi teléfono es 11 5555 1234. Quiero una amoladora');
  assert.match(r.reply, /registré tus datos/);
  const cs = (await C.get('/api/customers?q=ana')).body.customers;
  assert.equal(cs.length, 1); assert.equal(cs[0].lead_status, 'interested'); assert.equal(cs[0].phone, '11 5555 1234');
  const det = await C.get(`/api/customers/${cs[0].id}`);
  assert.equal(det.body.leads.length, 1); assert.equal(det.body.conversations.length, 1);
  const leadId = det.body.leads[0].id;
  await C.put(`/api/leads/${leadId}`, { status: 'won', value: 50000 });
  assert.equal((await C.get(`/api/customers/${cs[0].id}`)).body.customer.lead_status, 'customer');
  await text(C, 'Tengo un reclamo por mi compra');
  const tk = (await C.get('/api/tickets')).body.tickets;
  assert.equal(tk.length, 1);
  assert.equal((await C.put(`/api/tickets/${tk[0].id}`, { status: 'closed' })).body.ticket.status, 'closed');
  const manual = await C.post('/api/customers', { first_name: 'Beto', lead_status: 'contacted', tags: ['vip'] });
  assert.equal(manual.status, 201);
  assert.equal((await D.get(`/api/customers/${cs[0].id}`)).status, 404);
  assert.equal((await C.post('/api/customers', {})).status, 400);
});

test('automatizaciones: mensaje, stock bajo, nuevo cliente, cliente inactivo y registro de ejecuciones', async () => {
  const mk = (b) => C.post('/api/automations', b);
  assert.equal((await mk({ name: 'Precio', trigger: 'message.received', conditions: { keywords: ['precio'] }, actions: [{ type: 'send_message', text: 'Te paso la lista de precios enseguida.' }, { type: 'tag_conversation', tag: 'precio' }] })).status, 201);
  assert.equal((await mk({ name: 'Stock', trigger: 'stock.low', actions: [{ type: 'notify', title: 'Stock bajo: {{product.name}}', level: 'warning' }] })).status, 201);
  assert.equal((await mk({ name: 'Bienvenida', trigger: 'customer.created', actions: [{ type: 'create_ticket', title: 'Contactar a {{customer.name}}' }] })).status, 201);
  assert.equal((await mk({ name: 'Inactivos', trigger: 'customer.inactive', conditions: { days: 30 }, actions: [{ type: 'create_ticket', title: 'Seguimiento a {{customer.name}}', priority: 'high' }] })).status, 201);
  assert.equal((await mk({ name: 'x', trigger: 'inventado', actions: [{ type: 'notify' }] })).status, 400);
  const r = await text(C, 'qué precio tiene el serrucho?');
  assert.ok(r.automationReplies.includes('Te paso la lista de precios enseguida.'));
  const conv = (await C.get(`/api/conversations/${r.conversationId}`)).body;
  assert.ok(conv.conversation.tags.includes('precio')); assert.ok(conv.messages.some((m) => m.meta?.automation));
  const sku = (await C.get('/api/products?q=taladro')).body.products[0];
  await C.put(`/api/products/${sku.id}`, { stock: 1 });
  const notes = (await C.get('/api/notifications')).body;
  assert.ok(notes.notifications.some((n) => /Stock bajo: Taladro/.test(n.title)));
  const before = (await C.get('/api/tickets')).body.tickets.length;
  const nc = await C.post('/api/customers', { first_name: 'Carla', last_name: 'Gómez' });
  assert.equal((await C.get('/api/tickets')).body.tickets.length, before + 1);
  assert.ok((await C.get('/api/tickets')).body.tickets.some((t) => t.title === 'Contactar a Carla Gómez'));
  // inactivo: forzar antigüedad y correr el scheduler
  await db.system((q) => q("UPDATE customers SET created_at = now() - interval '45 days', last_purchase_at = NULL WHERE id = $1", [nc.body.customer.id]));
  const fired = await automations.runInactiveCustomers();
  assert.ok(fired >= 1);
  assert.equal(await automations.runInactiveCustomers() >= 0, true);
  const t2 = (await C.get('/api/tickets')).body.tickets.filter((t) => t.title === 'Seguimiento a Carla Gómez');
  assert.equal(t2.length, 1); // sin duplicados en la segunda corrida
  const al = (await C.get('/api/automations')).body;
  assert.ok(al.logs.some((l) => l.status === 'ok')); assert.equal((await D.get('/api/automations')).body.automations.length, 0);
});

test('analytics completo y rango personalizado', async () => {
  const a = await C.get('/api/analytics/overview?range=month');
  assert.equal(a.status, 200);
  const t = a.body.totals;
  assert.ok(t.leads >= 1 && t.quotes >= 1 && t.sales > 0 && t.customers >= 2);
  assert.ok(typeof t.avg_response_secs === 'number'); assert.ok(a.body.faq.length >= 1);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal((await C.get(`/api/analytics/overview?range=custom&from=${day}&to=${day}`)).status, 200);
  assert.equal((await C.get('/api/analytics/overview?range=custom&from=2026-02-01&to=2026-01-01')).status, 400);
  assert.equal((await C.get('/api/analytics/overview?range=custom')).status, 400);
});

test('permisos del CRM: solo lectura no escribe; operador no administra catálogo', async () => {
  await C.post('/api/users', { name: 'Vic', email: 'vic@gamma.com', password: 'ClaveSegura123', role: 'viewer' });
  await C.post('/api/users', { name: 'Ope', email: 'ope@gamma.com', password: 'ClaveSegura123', role: 'operator' });
  const v = await new Client(base).csrf(); await v.post('/api/auth/login', { email: 'vic@gamma.com', password: 'ClaveSegura123' });
  const o = await new Client(base).csrf(); await o.post('/api/auth/login', { email: 'ope@gamma.com', password: 'ClaveSegura123' });
  assert.equal((await v.get('/api/products')).status, 200);
  assert.equal((await v.post('/api/customers', { first_name: 'X' })).status, 403);
  assert.equal((await v.get('/api/approvals')).status, 403);
  assert.equal((await o.post('/api/customers', { first_name: 'Op' })).status, 201);
  assert.equal((await o.post('/api/products', { name: 'x' })).status, 403);
  assert.equal((await o.post('/api/automations', { name: 'x', trigger: 'stock.low', actions: [{ type: 'notify' }] })).status, 403);
  assert.equal((await o.get('/api/approvals')).status, 200);
});
