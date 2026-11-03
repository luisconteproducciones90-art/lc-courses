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
const COLS = 'id, name, email, role, status, last_login_at, created_at';
const password = z.string().min(10).max(128).refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Debe incluir letras y números');

router.get('/', requirePerm('users:read'), wrap(async (req, res) => {
  res.json({ users: await db.tenant(req.user.companyId, (q) => q(`SELECT ${COLS} FROM users ORDER BY created_at`)) });
}));

router.post('/', requirePerm('users:write'), wrap(async (req, res) => {
  const b = parse(z.object({ name: str(120, 2), email: z.string().trim().toLowerCase().email().max(200), password, role: z.enum(TEAM_ROLES) }), req.body);
  const hash = await bcrypt.hash(b.password, 12);
  const [u] = await db.tenant(req.user.companyId, async (q) => {
    await assertLimit(q, req.user.companyId, 'users');
    return q(`INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING ${COLS}`, [req.user.companyId, b.name, b.email, hash, b.role]);
  }).then((r) => (Array.isArray(r) ? r : [r]));
  await audit(req, 'user.create', 'user', u.id, { role: u.role });
  res.status(201).json({ user: u });
}));

router.put('/:id', requirePerm('users:write'), wrap(async (req, res) => {
  const uid = parse(id, req.params.id);
  const b = parse(z.object({ name: str(120, 2), role: z.enum(TEAM_ROLES), status: z.enum(['active', 'disabled']) }).partial(), req.body);
  if (uid === req.user.id && (b.role || b.status === 'disabled')) throw E.badRequest('No podés cambiar tu propio rol ni desactivarte');
  const u = await db.tenant(req.user.companyId, async (q) => {
    const [cur] = await q('SELECT * FROM users WHERE id = $1', [uid]); // RLS: solo usuarios de la empresa
    if (!cur) throw E.notFound('Usuario no encontrado');
    if (b.status === 'active' && cur.status !== 'active') await assertLimit(q, req.user.companyId, 'users');
    const [r] = await q(`UPDATE users SET name = COALESCE($2,name), role = COALESCE($3,role), status = COALESCE($4,status) WHERE id = $1 RETURNING ${COLS}`, [uid, b.name ?? null, b.role ?? null, b.status ?? null]);
    return r;
  });
  if (b.status === 'disabled') await db.system((q) => q('UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [uid]));
  await audit(req, 'user.update', 'user', uid, b);
  res.json({ user: u });
}));

module.exports = router;
