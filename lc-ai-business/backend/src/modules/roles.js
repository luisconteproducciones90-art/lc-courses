'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { audit } = require('../lib/audit');
const { clean } = require('../lib/text');
const { GRANTABLE, GRANTABLE_SET, normalize } = require('../lib/permissions');

const router = express.Router();
router.use(authenticate);

const body = z.object({ name: str(60, 2), description: str(200), permissions: z.array(z.string()).min(1, 'Elegí al menos un permiso').max(40) });
function validPerms(list) {
  const bad = list.filter((p) => !GRANTABLE_SET.has(p));
  if (bad.length) throw E.badRequest(`Permisos no delegables o inexistentes: ${bad.join(', ')}. La gestión de usuarios, roles y pagos es solo del administrador.`);
  return normalize(list);
}

router.get('/', requirePerm('roles:read'), wrap(async (req, res) => {
  const roles = await db.tenant(req.user.companyId, (q) => q('SELECT r.*, (SELECT count(*)::int FROM users u WHERE u.role_id = r.id) AS users FROM roles r ORDER BY r.name'));
  res.json({ roles, catalog: GRANTABLE.map(([group, items]) => ({ group, items: items.map(([key, label]) => ({ key, label })) })) });
}));

router.post('/', requirePerm('roles:write'), wrap(async (req, res) => {
  const b = parse(body.partial({ description: true }), req.body);
  const perms = validPerms(b.permissions);
  const [r] = await db.tenant(req.user.companyId, (q) => q('INSERT INTO roles (company_id, name, description, permissions) VALUES ($1,$2,$3,$4) RETURNING *', [req.user.companyId, clean(b.name, 60), clean(b.description || '', 200), perms]));
  await audit(req, 'role.create', 'role', r.id, { permissions: perms });
  res.status(201).json({ role: r });
}));

router.put('/:id', requirePerm('roles:write'), wrap(async (req, res) => {
  const rid = parse(id, req.params.id); const b = parse(body.partial(), req.body);
  const perms = b.permissions ? validPerms(b.permissions) : null;
  const r = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q('SELECT id FROM roles WHERE id = $1', [rid]); if (!cur) throw E.notFound('Rol no encontrado');
    return (await q('UPDATE roles SET name = COALESCE($2,name), description = COALESCE($3,description), permissions = COALESCE($4,permissions) WHERE id = $1 RETURNING *', [rid, b.name ? clean(b.name, 60) : null, b.description ?? null, perms]))[0];
  });
  await audit(req, 'role.update', 'role', rid, { permissions: perms }); // los cambios rigen de inmediato: los permisos se leen en cada request
  res.json({ role: r });
}));

router.delete('/:id', requirePerm('roles:write'), wrap(async (req, res) => {
  const rid = parse(id, req.params.id);
  const moved = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q('SELECT id FROM roles WHERE id = $1', [rid]); if (!cur) throw E.notFound('Rol no encontrado');
    const m = await q("UPDATE users SET role = 'viewer', role_id = NULL WHERE role_id = $1 RETURNING id", [rid]); // quienes lo tenían pasan a solo lectura
    await q('DELETE FROM roles WHERE id = $1', [rid]);
    return m.length;
  });
  await audit(req, 'role.delete', 'role', rid, { users_moved_to_viewer: moved });
  res.json({ ok: true, users_moved: moved });
}));

module.exports = router;
