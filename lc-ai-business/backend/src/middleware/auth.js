'use strict';
const db = require('../db/pool');
const { verifyAccess } = require('../lib/tokens');
const { E } = require('../lib/httpError');
const { permsFor, has } = require('../lib/permissions');

/** Exige sesión válida y adjunta req.user. El company_id sale SIEMPRE de acá. */
async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.lc_at;
    if (!token) throw E.unauthorized();
    let payload;
    try { payload = verifyAccess(token); } catch { throw E.unauthorized('Sesión expirada'); }
    const [u] = await db.system((q) =>
      q(`SELECT u.id, u.company_id, u.email, u.name, u.role, u.role_id, r.name AS role_name, r.permissions AS custom_perms, u.status, c.status AS company_status, c.name AS company_name, c.is_demo
           FROM users u LEFT JOIN companies c ON c.id = u.company_id LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [payload.sub]));
    if (!u || u.status !== 'active') throw E.unauthorized('Cuenta inactiva');
    if (u.role !== 'super_admin' && u.company_status === 'suspended') throw E.forbidden('La empresa está suspendida. Contactá a LC-SYSTEM.');
    req.user = { id: u.id, companyId: u.company_id, email: u.email, name: u.name, role: u.role, roleName: u.role_name || null, permissions: u.role_id && u.custom_perms ? u.custom_perms : permsFor(u.role), companyName: u.company_name, companyStatus: u.company_status };
    next();
  } catch (e) { next(e); }
}

const requirePerm = (perm) => (req, res, next) => {
  if (!req.user) return next(E.unauthorized());
  if (!has(req.user, perm)) return next(E.forbidden());
  if (!perm.startsWith('admin:') && !req.user.companyId) return next(E.forbidden('Esta acción requiere una empresa'));
  next();
};

module.exports = { authenticate, requirePerm };
