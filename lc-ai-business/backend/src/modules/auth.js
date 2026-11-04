'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const env = require('../config/env');
const db = require('../db/pool');
const rl = require('../middleware/rateLimit');
const { wrap } = require('../middleware/errors');
const { authenticate } = require('../middleware/auth');
const { issueCsrfCookie } = require('../middleware/csrf');
const { parse, z, str } = require('../lib/validate');
const { E } = require('../lib/httpError');
const { sha256, randomToken, signAccess } = require('../lib/tokens');
const { audit } = require('../lib/audit');
const { permsFor } = require('../lib/permissions');

const router = express.Router();
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

const password = z.string().min(10, 'Mínimo 10 caracteres').max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Debe incluir letras y números');
const email = z.string().trim().toLowerCase().email().max(200);

const cookieBase = { httpOnly: true, sameSite: 'lax', secure: env.cookieSecure };

async function startSession(req, res, user, familyId) {
  const refresh = randomToken(48);
  await db.system((q) => q(
    'INSERT INTO refresh_sessions (user_id, family_id, token_hash, expires_at, user_agent, ip) VALUES ($1,$2,$3, now() + ($4 || \' seconds\')::interval,$5,$6)',
    [user.id, familyId || crypto.randomUUID(), sha256(refresh), String(env.refreshTtlSec), String(req.get('user-agent') || '').slice(0, 200), req.ip || '']));
  res.cookie('lc_at', signAccess(user), { ...cookieBase, path: '/', maxAge: env.accessTtlSec * 1000 });
  res.cookie('lc_rt', refresh, { ...cookieBase, path: '/api/auth', maxAge: env.refreshTtlSec * 1000 });
  issueCsrfCookie(res);
}
const clearCookies = (res) => {
  res.clearCookie('lc_at', { ...cookieBase, path: '/' });
  res.clearCookie('lc_rt', { ...cookieBase, path: '/api/auth' });
};

async function profile(user) {
  const company = user.company_id
    ? (await db.system((q) => q(
      `SELECT c.id, c.name, c.status, c.is_demo, c.public_key, p.code AS plan_code, p.name AS plan_name, p.limits AS plan_limits
         FROM companies c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = $1`, [user.company_id])))[0]
    : null;
  let perms = permsFor(user.role); let roleName = null;
  if (user.role_id) {
    const [r] = await db.system((q) => q('SELECT name, permissions FROM roles WHERE id = $1', [user.role_id]));
    if (r) { perms = r.permissions; roleName = r.name; }
  }
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role, role_name: roleName }, company, permissions: perms };
}

router.get('/csrf', (req, res) => { res.json({ csrfToken: issueCsrfCookie(res) }); });

router.post('/register', rl.auth, wrap(async (req, res) => {
  const b = parse(z.object({ companyName: str(120, 2), name: str(120, 2), email, password }), req.body);
  const hash = await bcrypt.hash(b.password, 12);
  const user = await db.system(async (q) => {
    const [plan] = await q("SELECT id FROM plans WHERE code = 'start' AND is_active");
    const [c] = await q("INSERT INTO companies (name, plan_id, status) VALUES ($1,$2,'trial') RETURNING id", [b.companyName, plan?.id || null]);
    if (plan) await q("INSERT INTO subscriptions (company_id, plan_id, status) VALUES ($1,$2,'trialing')", [c.id, plan.id]);
    const [u] = await q("INSERT INTO users (company_id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,'company_admin') RETURNING *", [c.id, b.email, hash, b.name]);
    return u;
  }).catch((e) => { if (e.code === '23505') throw E.conflict('Ya existe una cuenta con ese email'); throw e; });
  await startSession(req, res, user);
  req.user = { id: user.id, companyId: user.company_id };
  await audit(req, 'auth.register', 'user', user.id);
  res.status(201).json(await profile(user));
}));

router.post('/login', rl.auth, wrap(async (req, res) => {
  const b = parse(z.object({ email, password: z.string().min(1).max(128) }), req.body);
  const [u] = await db.system((q) => q('SELECT u.*, c.status AS company_status FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE lower(u.email) = $1', [b.email]));
  const locked = u?.locked_until && new Date(u.locked_until) > new Date();
  const ok = await bcrypt.compare(b.password, u?.password_hash || DUMMY_HASH); // siempre compara: tiempo constante
  if (locked) throw E.tooMany(`Cuenta bloqueada temporalmente por intentos fallidos. Reintentá en ${LOCK_MIN} minutos.`);
  if (!u || !ok || u.status !== 'active') {
    if (u) {
      await db.system((q) => q(
        `UPDATE users SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END WHERE id = $1`,
        [u.id, MAX_FAILS, String(LOCK_MIN)]));
      await audit({ ...req, user: null, ip: req.ip }, 'auth.login_failed', 'user', u.id, {}, u.company_id);
    }
    throw E.unauthorized('Email o contraseña incorrectos'); // mismo mensaje exista o no el usuario
  }
  if (u.role !== 'super_admin' && u.company_status === 'suspended') throw E.forbidden('La empresa está suspendida. Contactá a LC-SYSTEM.');
  await db.system((q) => q('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [u.id]));
  await startSession(req, res, u);
  req.user = { id: u.id, companyId: u.company_id };
  await audit(req, 'auth.login', 'user', u.id);
  res.json(await profile(u));
}));

router.post('/refresh', rl.auth, wrap(async (req, res) => {
  const token = req.cookies?.lc_rt;
  if (!token) throw E.unauthorized();
  const result = await db.system(async (q) => {
    const [s] = await q('SELECT * FROM refresh_sessions WHERE token_hash = $1 FOR UPDATE', [sha256(token)]);
    if (!s) return { err: 'invalid' };
    if (s.revoked_at) { await q('UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1', [s.family_id]); return { err: 'reuse' }; } // reutilización: revoca la familia
    if (new Date(s.expires_at) < new Date()) return { err: 'expired' };
    const [u] = await q('SELECT u.*, c.status AS company_status FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = $1', [s.user_id]);
    if (!u || u.status !== 'active' || (u.role !== 'super_admin' && u.company_status === 'suspended')) return { err: 'inactive' };
    await q('UPDATE refresh_sessions SET revoked_at = now() WHERE id = $1', [s.id]);
    return { user: u, family: s.family_id };
  });
  if (result.err) { clearCookies(res); throw E.unauthorized('Sesión expirada'); }
  await startSession(req, res, result.user, result.family);
  res.json(await profile(result.user));
}));

router.post('/logout', wrap(async (req, res) => {
  const token = req.cookies?.lc_rt;
  if (token) await db.system((q) => q('UPDATE refresh_sessions SET revoked_at = now() WHERE family_id IN (SELECT family_id FROM refresh_sessions WHERE token_hash = $1)', [sha256(token)]));
  clearCookies(res);
  res.json({ ok: true });
}));

router.get('/me', authenticate, wrap(async (req, res) => {
  const [u] = await db.system((q) => q('SELECT * FROM users WHERE id = $1', [req.user.id]));
  res.json(await profile(u));
}));

router.post('/change-password', authenticate, rl.auth, wrap(async (req, res) => {
  const b = parse(z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }), req.body);
  const [u] = await db.system((q) => q('SELECT * FROM users WHERE id = $1', [req.user.id]));
  if (!(await bcrypt.compare(b.currentPassword, u.password_hash))) throw E.badRequest('La contraseña actual no es correcta');
  const hash = await bcrypt.hash(b.newPassword, 12);
  await db.system(async (q) => {
    await q('UPDATE users SET password_hash = $2 WHERE id = $1', [u.id, hash]);
    await q('UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [u.id]);
  });
  await startSession(req, res, u);
  await audit(req, 'auth.change_password', 'user', u.id);
  res.json({ ok: true });
}));

module.exports = router;
