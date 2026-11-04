'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, Client, db } = require('./helpers');

let server; let base; let A; let B; let root; let seller; let sellerUser;
const login = async (email) => { const c = await new Client(base).csrf(); const r = await c.post('/api/auth/login', { email, password: 'ClaveSegura123' }); assert.equal(r.status, 200, r.text); return { c, me: r.body }; };

before(async () => {
  ({ server, base } = await start());
  A = new Client(base); B = new Client(base); root = new Client(base);
  await A.register('Comercio Rho', 'rho@test.com'); await B.register('Comercio Sigma', 'sigma2@test.com'); await root.login('root@lc.test', 'SuperSecreta123');
  const cid = (await A.get('/api/auth/me')).body.company.id;
  await root.req('PATCH', `/api/admin/companies/${cid}`, { planCode: 'enterprise' });
});
after(async () => { server.close(); await db.close(); });

test('crear rol propio: catálogo, validación y permisos no delegables', async () => {
  const list = await A.get('/api/roles');
  assert.equal(list.status, 200); assert.ok(list.body.catalog.length >= 8);
  const keys = list.body.catalog.flatMap((g) => g.items.map((i) => i.key));
  assert.ok(!keys.some((k) => /^(users|roles|admin)/.test(k)) && !keys.includes('billing:write'));
  for (const bad of [['users:write'], ['roles:write'], ['admin:*'], ['billing:write'], ['inventado:x'], ['crm:read', 'users:read']]) {
    assert.equal((await A.post('/api/roles', { name: 'Malicioso', permissions: bad })).status, 400, bad.join());
  }
  assert.equal((await A.post('/api/roles', { name: 'Vacío', permissions: [] })).status, 400);
  const r = await A.post('/api/roles', { name: 'Vendedor', description: 'Atiende y vende', permissions: ['conversations:reply', 'crm:write', 'catalog:read'] });
  assert.equal(r.status, 201, r.text);
  seller = r.body.role;
  assert.deepEqual(seller.permissions, ['catalog:read', 'conversations:read', 'conversations:reply', 'crm:read', 'crm:write']); // escribir implica leer
  assert.equal((await A.post('/api/roles', { name: 'Vendedor', permissions: ['crm:read'] })).status, 409);
});

test('asignar el rol: el usuario obtiene exactamente esos permisos', async () => {
  const u = await A.post('/api/users', { name: 'Vera Vendedora', email: 'vera@rho.com', password: 'ClaveSegura123', role_id: seller.id });
  assert.equal(u.status, 201, u.text); sellerUser = u.body.user; assert.equal(sellerUser.role_id, seller.id);
  const { c, me } = await login('vera@rho.com');
  assert.equal(me.user.role_name, 'Vendedor'); assert.deepEqual([...me.permissions].sort(), seller.permissions);
  assert.equal((await c.get('/api/customers')).status, 200);
  assert.equal((await c.post('/api/customers', { first_name: 'Cliente de Vera' })).status, 201);
  assert.equal((await c.get('/api/products')).status, 200);
  assert.equal((await c.post('/api/products', { name: 'x' })).status, 403); // catalog:write no concedido
  assert.equal((await c.post('/api/agents', { name: 'x', type: 'sales' })).status, 403);
  assert.equal((await c.get('/api/automations')).status, 403);
  assert.equal((await c.get('/api/billing')).status, 403);
  assert.equal((await c.get('/api/users')).status, 403); // no puede administrar usuarios ni roles
  assert.equal((await c.post('/api/users', { name: 'Intruso', email: 'x@rho.com', password: 'ClaveSegura123', role: 'company_admin' })).status, 403);
  assert.equal((await c.get('/api/roles')).status, 403);
  assert.equal((await c.put(`/api/roles/${seller.id}`, { permissions: ['crm:read', 'catalog:write'] })).status, 403); // no puede escalarse
});

test('los cambios del rol rigen de inmediato, sin volver a iniciar sesión', async () => {
  const { c } = await login('vera@rho.com');
  assert.equal((await c.post('/api/customers', { first_name: 'Otro' })).status, 201);
  const up = await A.put(`/api/roles/${seller.id}`, { permissions: ['crm:read', 'catalog:write'] });
  assert.equal(up.status, 200); assert.deepEqual(up.body.role.permissions, ['catalog:read', 'catalog:write', 'crm:read']);
  assert.equal((await c.post('/api/customers', { first_name: 'Ya no' })).status, 403);
  assert.equal((await c.post('/api/products', { name: 'Producto de Vera', price: 10 })).status, 201);
  assert.equal((await c.get('/api/customers')).status, 200);
  const users = (await A.get('/api/users')).body.users; assert.equal(users.find((x) => x.id === sellerUser.id).role_name, 'Vendedor');
  assert.equal((await A.get('/api/roles')).body.roles.find((r) => r.id === seller.id).users, 1);
});

test('aislamiento entre empresas y reglas de seguridad de usuarios', async () => {
  assert.deepEqual((await B.get('/api/roles')).body.roles, []);
  assert.equal((await B.put(`/api/roles/${seller.id}`, { name: 'Hackeado' })).status, 404);
  assert.equal((await B.del(`/api/roles/${seller.id}`)).status, 404);
  assert.equal((await B.post('/api/users', { name: 'Cruzado', email: 'cruz@sigma.com', password: 'ClaveSegura123', role_id: seller.id })).status, 400); // rol de otra empresa
  assert.equal((await A.post('/api/users', { name: 'Sin rol', email: 'sinrol@rho.com', password: 'ClaveSegura123' })).status, 400);
  // último administrador
  const me = (await A.get('/api/auth/me')).body.user;
  const adm2 = (await A.post('/api/users', { name: 'Segundo Admin', email: 'adm2@rho.com', password: 'ClaveSegura123', role: 'company_admin' })).body.user;
  assert.equal((await A.put(`/api/users/${me.id}`, { role_id: seller.id })).status, 400); // no se cambia el propio rol
  const { c: c2 } = await login('adm2@rho.com');
  assert.equal((await c2.put(`/api/users/${me.id}`, { role: 'viewer' })).status, 200); // hay otro admin: se permite
  assert.equal((await A.get('/api/auth/me')).body.user.role, 'viewer');
  const adm1 = await login('rho@test.com'); // el original ahora es lector
  assert.equal((await adm1.c.get('/api/users')).status, 403);
  assert.equal((await c2.put(`/api/users/${adm2.id}`, { role: 'operator' })).status, 400); // no puede auto-degradarse
  await c2.put(`/api/users/${me.id}`, { role: 'company_admin' }); // se restituye
  assert.equal((await A.get('/api/auth/me')).body.user.role, 'company_admin');
});

test('borrar un rol: sus usuarios pasan a solo lectura', async () => {
  const del = await A.del(`/api/roles/${seller.id}`);
  assert.equal(del.status, 200); assert.equal(del.body.users_moved, 1);
  const { c, me } = await login('vera@rho.com');
  assert.equal(me.user.role, 'viewer'); assert.equal(me.user.role_name, null);
  assert.equal((await c.post('/api/products', { name: 'x' })).status, 403); assert.equal((await c.get('/api/products')).status, 200);
  assert.ok((await root.get('/api/admin/audit')).body.logs.some((l) => l.action === 'role.delete'));
});
