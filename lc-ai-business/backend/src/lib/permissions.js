'use strict';
// Matriz de permisos por rol. SUPER ADMIN opera solo en /api/admin (no tiene empresa).
const P = {
  company_admin: [
    'company:read', 'company:update', 'users:read', 'users:write', 'agents:read', 'agents:write',
    'conversations:read', 'conversations:reply', 'knowledge:read', 'knowledge:write', 'analytics:read',
    'crm:read', 'crm:write', 'catalog:read', 'catalog:write', 'automations:read', 'automations:write', 'approvals:decide',
  ],
  operator: ['company:read', 'agents:read', 'conversations:read', 'conversations:reply', 'knowledge:read', 'analytics:read', 'crm:read', 'crm:write', 'catalog:read', 'automations:read', 'approvals:decide'],
  viewer: ['company:read', 'agents:read', 'conversations:read', 'knowledge:read', 'analytics:read', 'crm:read', 'catalog:read', 'automations:read'],
  super_admin: ['admin:*'],
};
const can = (role, perm) => (P[role] || []).includes(perm) || (role === 'super_admin' && perm.startsWith('admin:'));
const permsFor = (role) => P[role] || [];
module.exports = { can, permsFor, ROLES: ['super_admin', 'company_admin', 'operator', 'viewer'], TEAM_ROLES: ['company_admin', 'operator', 'viewer'] };
