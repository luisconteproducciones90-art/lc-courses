'use strict';
process.env.OPENAI_API_KEY = 'sk-test-embeddings-key';
process.env.EMBEDDINGS_PROVIDER = 'local'; // arranca en modo local; el test cambia a openai desde SUPER ADMIN
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, Client, db } = require('./helpers');
const embeddings = require('../src/ai/embeddings');
const knowledgeIndex = require('../src/services/knowledgeIndex');

let server; let base; let S; let T; let root; let sid; let agent; let calls = 0; let failEmbeddings = false;
const WANT_PGV = !!process.env.TEST_SUPERUSER_URL;

// "Modelo" simulado: conceptos en ejes. Solo prueba la cañería; la calidad semántica real depende de OpenAI.
const CONCEPTS = [['taladro', 'perforar', 'agujerear', 'amoladora', 'martillo'], ['pintura', 'pintar', 'látex', 'rodillo'], ['envío', 'entrega', 'reparto', 'despacho']];
function fakeVec(text) { const t = String(text).toLowerCase(); const v = new Array(1536).fill(0); CONCEPTS.forEach((words, i) => { if (words.some((w) => t.includes(w))) v[i] = 1; }); if (!v.some((x) => x)) v[1535] = 1; const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); return v.map((x) => x / n); }

before(async () => {
  ({ server, base } = await start());
  knowledgeIndex.resetPgvectorCache();
  S = new Client(base); T = new Client(base); root = new Client(base);
  await S.register('Ferretería Sigma', 'sigma@test.com'); await T.register('Tienda Tau', 'tau@test.com'); await root.login('root@lc.test', 'SuperSecreta123');
  sid = (await S.get('/api/auth/me')).body.company.id;
  await root.req('PATCH', `/api/admin/companies/${sid}`, { planCode: 'enterprise' });
  agent = (await S.post('/api/agents', { name: 'Sofía', type: 'attention', status: 'active' })).body.agent;
  embeddings.setTransport(async (url, opts) => {
    calls += 1; if (failEmbeddings) throw new Error('red caída');
    const input = JSON.parse(opts.body).input;
    return { status: 200, headers: {}, body: Buffer.from(JSON.stringify({ data: input.map((t, i) => ({ index: i, embedding: fakeVec(t) })) })) };
  });
});
after(async () => { server.close(); await db.close(); });

test('modo local: tolera errores de tipeo y acentos que la búsqueda por palabras no encuentra', async () => {
  const st0 = (await S.get('/api/knowledge/status')).body;
  assert.equal(st0.provider, 'local'); assert.equal(st0.semantic, false); assert.equal(st0.pgvector, WANT_PGV);
  await S.post('/api/documents/text', { title: 'Herramientas', content: 'Los taladros percutores perforan hormigón y ladrillo con facilidad.\n\nLa amoladora angular corta metal y cerámica.' });
  await S.post('/api/documents/text', { title: 'Pinturas', content: 'La pintura látex interior se aplica con rodillo y rinde diez metros por litro.' });
  const typo = (await S.get('/api/knowledge/search?q=' + encodeURIComponent('taldro percutor'))).body;
  assert.equal(typo.mode, 'hybrid');
  assert.match(typo.results[0].content, /taladros percutores/); assert.ok(typo.results[0].via.includes('similitud'));
  const accent = (await S.get('/api/knowledge/search?q=' + encodeURIComponent('perforacion hormigon'))).body;
  assert.ok(accent.results.some((r) => /taladros/.test(r.content)));
  // la búsqueda por palabras sola no lo encontraba
  const kw = await db.tenant(sid, (q) => require('../src/ai/retriever').search(q, { query: 'taldro percutor' }));
  assert.equal(kw.filter((r) => /taladros/.test(r.content)).length, 1); // 'percutor' sí; 'taldro' no: el híbrido igual lo ubica primero
  const st = (await S.get('/api/knowledge/status')).body; assert.equal(st.total, st.indexed); assert.ok(st.total >= 2);
});

test('el agente usa el conocimiento híbrido (typo del cliente)', async () => {
  const r = (await S.post(`/api/ai/agents/${agent.id}/test`, { message: 'cuanto rinde la pintura latex?' })).body;
  assert.match(r.reply, /diez metros por litro/);
});

test('proveedor OpenAI (simulado): sinónimos sin palabras en común, reindexado y consumo registrado', async () => {
  assert.equal((await S.put('/api/admin/embeddings', { provider: 'openai' })).status, 403); // solo SUPER ADMIN
  assert.equal((await root.put('/api/admin/embeddings', { provider: 'openai' })).status, 200);
  const adm = (await root.get('/api/admin/embeddings')).body; assert.equal(adm.active.provider, 'openai'); assert.equal(adm.active.semantic, true);
  // los fragmentos viejos quedan con otro modelo: no se comparan hasta reindexar
  let st = (await S.get('/api/knowledge/status')).body; assert.equal(st.indexed, 0); assert.ok(st.total >= 2);
  const before = (await S.get('/api/knowledge/search?q=' + encodeURIComponent('agujerear una pared'))).body;
  assert.equal(before.results.length, 0); // sin índice del modelo nuevo ni palabras en común
  calls = 0;
  const ri = await S.post('/api/knowledge/reindex'); assert.equal(ri.status, 200, ri.text);
  assert.equal(ri.body.remaining, 0); assert.ok(ri.body.reindexed >= 2); assert.ok(calls >= 1);
  assert.equal(ri.body.status.indexed, ri.body.status.total); assert.equal(ri.body.status.model, 'openai:text-embedding-3-small');
  const syn = (await S.get('/api/knowledge/search?q=' + encodeURIComponent('agujerear una pared'))).body;
  assert.ok(syn.results.length >= 1); assert.match(syn.results[0].content, /taladros percutores/); assert.deepEqual(syn.results[0].via, ['semántica']);
  const u = await db.system((q) => q("SELECT sum(tokens_in)::int t FROM usage WHERE provider = 'openai-embeddings' AND company_id = $1", [sid])); assert.ok(u[0].t > 0); // cuenta para los límites del plan
  // documentos nuevos se indexan al subir
  await S.post('/api/documents/text', { title: 'Logística', content: 'El reparto a domicilio demora dos días hábiles dentro de la ciudad.' });
  const env = (await S.get('/api/knowledge/search?q=' + encodeURIComponent('cuándo llega la entrega'))).body;
  assert.ok(env.results.some((r) => /reparto a domicilio/.test(r.content)));
  assert.equal((await S.get('/api/knowledge/status')).body.indexed, (await S.get('/api/knowledge/status')).body.total);
  // el agente responde con un sinónimo
  const r = (await S.post(`/api/ai/agents/${agent.id}/test`, { message: 'quiero agujerear el ladrillo' })).body;
  assert.match(r.reply, /taladros percutores/);
});

test('aislamiento: otra empresa nunca recibe fragmentos ajenos por similitud', async () => {
  await T.post('/api/documents/text', { title: 'Tau', content: 'Vendemos ropa deportiva y calzado para correr.' });
  await T.post('/api/knowledge/reindex');
  const r = (await T.get('/api/knowledge/search?q=' + encodeURIComponent('taladro perforar hormigón'))).body;
  assert.ok(r.results.every((x) => !/taladros|amoladora|pintura/i.test(x.content)));
  const cidT = (await T.get('/api/auth/me')).body.company.id;
  const vec = await db.tenant(cidT, (q) => require('../src/ai/retriever').vectorSearch(q, { vector: fakeVec('taladro'), model: 'openai:text-embedding-3-small', minSim: -1, agentId: null, limit: 50 }));
  assert.ok(vec.every((x) => !/taladros|amoladora/i.test(x.content)));
});

test('resiliencia: si el proveedor de embeddings falla, se indexa por palabras y la búsqueda sigue', async () => {
  failEmbeddings = true;
  const d = await S.post('/api/documents/text', { title: 'Garantías', content: 'La garantía de las herramientas eléctricas es de doce meses desde la compra.' });
  assert.equal(d.status, 201); // el documento se carga igual
  const s = (await S.get('/api/knowledge/search?q=' + encodeURIComponent('garantía herramientas'))).body;
  assert.equal(s.mode, 'keyword'); assert.ok(s.results.some((r) => /doce meses/.test(r.content)));
  const st = (await S.get('/api/knowledge/status')).body; assert.ok(st.indexed < st.total);
  assert.equal((await S.post('/api/knowledge/reindex')).status, 502);
  const chat = (await S.post(`/api/ai/agents/${agent.id}/test`, { message: 'cuál es la garantía' })).body;
  assert.match(chat.reply, /doce meses/); // el agente sigue respondiendo
  failEmbeddings = false;
  assert.equal((await S.post('/api/knowledge/reindex')).body.remaining, 0);
  assert.equal((await new Client(base).get('/api/knowledge/status')).status, 401);
});
