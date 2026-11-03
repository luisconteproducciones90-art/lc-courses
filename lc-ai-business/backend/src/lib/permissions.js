'use strict';
// Matriz de permisos por rol. SUPER ADMIN opera solo en /api/admin (no tiene empresa).
const P = {
  company_admin: [
    'company:read', 'company:update', 'users:read', 'users:write', 'agents:read', 'agents:write',
    'conversations:read', 'conversations:reply', 'knowledge:read', 'knowledge:write', 'analytics:read',
  ],
  operator: ['company:read', 'agents:read', 'conversations:read', 'conversations:reply', 'knowledge:read', 'analytics:read'],
  viewer: ['company:read', 'agents:read', 'conversations:read', 'knowledge:read', 'analytics:read'],
  super_admin: ['admin:*'],
};
const can = (role, perm) => (P[role] || []).includes(perm) || (role === 'super_admin' && perm.startsWith('admin:'));
module.exports = { can, ROLES: ['super_admin', 'company_admin', 'operator', 'viewer'], TEAM_ROLES: ['company_admin', 'operator', 'viewer'] };
