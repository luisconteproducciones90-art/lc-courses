'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate, requirePerm } = require('../middleware/auth');
const { parse, z, str, id } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { TEAM_ROLES } = require('../lib/permissions');
const { assertLimit } = require('../lib/plans');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(authenticate);
const COLS = 'id, name, email, role, role_id, status, last_login_at, created_at';
const LIST = `SELECT u.id, u.name, u.email, u.role, u.role_id, r.name AS role_name, u.status, u.last_login_at, u.created_at FROM users u LEFT JOIN roles r ON r.id = u.role_id ORDER BY u.created_at`;
const password = z.string().min(10).max(128).refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Debe incluir letras y números');

router.get('/', requirePerm('users:read'), wrap(async (req, res) => {
  res.json({ users: await db.tenant(req.user.companyId, (q) => q(LIST)) });
}));

// Rol del usuario: uno base (role) o uno propio de la empresa (role_id). Con role_id, users.role queda en 'viewer' como base.
async function resolveRole(q, b) {
  if (b.role_id) {
    const [r] = await q('SELECT id FROM roles WHERE id = $1', [b.role_id]); // RLS: solo roles de esta empresa
    if (!r) throw E.badRequest('El rol elegido no existe');
    return { role: 'viewer', roleId: r.id };
  }
  if (b.role) return { role: b.role, roleId: null };
  return null;
}
const lastAdminGuard = async (q, uid) => {
  const [r] = await q("SELECT count(*)::int n FROM users WHERE role = 'company_admin' AND role_id IS NULL AND status = 'active' AND id <> $1", [uid]);
  if (!r.n) throw E.badRequest('Debe quedar al menos un administrador activo en la empresa');
};

router.post('/', requirePerm('users:write'), wrap(async (req, res) => {
  const b = parse(z.object({ name: str(120, 2), email: z.string().trim().toLowerCase().email().max(200), password, role: z.enum(TEAM_ROLES).optional(), role_id: id.optional() })
    .refine((v) => v.role || v.role_id, 'Elegí un rol'), req.body);
  const hash = await bcrypt.hash(b.password, 12);
  const [u] = await db.tenant(req.user.companyId, async (q) => {
    await assertLimit(q, req.user.companyId, 'users');
    const r = await resolveRole(q, b);
    return q(`INSERT INTO users (company_id, name, email, password_hash, role, role_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`, [req.user.companyId, b.name, b.email, hash, r.role, r.roleId]);
  }).then((r) => (Array.isArray(r) ? r : [r]));
  await audit(req, 'user.create', 'user', u.id, { role: u.role, role_id: u.role_id });
  res.status(201).json({ user: u });
}));

router.put('/:id', requirePerm('users:write'), wrap(async (req, res) => {
  const uid = parse(id, req.params.id);
  const b = parse(z.object({ name: str(120, 2), role: z.enum(TEAM_ROLES), role_id: id, status: z.enum(['active', 'disabled']) }).partial(), req.body);
  if (uid === req.user.id && (b.role || b.role_id || b.status === 'disabled')) throw E.badRequest('No podés cambiar tu propio rol ni desactivarte');
  const u = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q('SELECT * FROM users WHERE id = $1', [uid]); // RLS: solo usuarios de la empresa
    if (!cur) throw E.notFound('Usuario no encontrado');
    if (b.status === 'active' && cur.status !== 'active') await assertLimit(q, req.user.companyId, 'users');
    const r = await resolveRole(q, b);
    const wasAdmin = cur.role === 'company_admin' && !cur.role_id && cur.status === 'active';
    if (wasAdmin && ((r && !(r.role === 'company_admin' && !r.roleId)) || b.status === 'disabled')) await lastAdminGuard(q, uid);
    const [row] = await q(`UPDATE users SET name = COALESCE($2,name), role = COALESCE($3,role), role_id = CASE WHEN $3::text IS NULL THEN role_id ELSE $4 END, status = COALESCE($5,status) WHERE id = $1 RETURNING ${COLS}`,
      [uid, b.name ?? null, r?.role ?? null, r?.roleId ?? null, b.status ?? null]);
    return row;
  });
  if (b.status === 'disabled') await db.system((q) => q('UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [uid]));
  await audit(req, 'user.update', 'user', uid, b);
  res.json({ user: u });
}));

module.exports = router;
