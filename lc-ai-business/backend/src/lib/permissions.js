'use strict';
// Permisos. Roles base fijos + roles personalizados por empresa (tabla roles).
// SUPER ADMIN opera solo en /api/admin (no tiene empresa).
const P = {
  company_admin: [
    'company:read', 'company:update', 'users:read', 'users:write', 'roles:read', 'roles:write', 'agents:read', 'agents:write',
    'conversations:read', 'conversations:reply', 'knowledge:read', 'knowledge:write', 'analytics:read',
    'crm:read', 'crm:write', 'catalog:read', 'catalog:write', 'automations:read', 'automations:write', 'approvals:decide', 'integrations:read', 'integrations:write', 'billing:read', 'billing:write',
  ],
  operator: ['company:read', 'agents:read', 'conversations:read', 'conversations:reply', 'knowledge:read', 'analytics:read', 'crm:read', 'crm:write', 'catalog:read', 'automations:read', 'approvals:decide'],
  viewer: ['company:read', 'agents:read', 'conversations:read', 'knowledge:read', 'analytics:read', 'crm:read', 'catalog:read', 'automations:read'],
  super_admin: ['admin:*'],
};

// Lo que un administrador puede delegar en un rol propio. users:*, roles:* y billing:write NO se delegan
// (evita escaladas de privilegio y cambios financieros): solo el administrador de la empresa.
const GRANTABLE = [
  ['Empresa', [['company:read', 'Ver datos de la empresa'], ['company:update', 'Editar datos de la empresa']]],
  ['Agentes', [['agents:read', 'Ver agentes'], ['agents:write', 'Crear y editar agentes']]],
  ['Conversaciones', [['conversations:read', 'Ver conversaciones'], ['conversations:reply', 'Responder, tomar control y cerrar']]],
  ['Conocimiento', [['knowledge:read', 'Ver documentos'], ['knowledge:write', 'Cargar y borrar documentos']]],
  ['Clientes, tickets y pedidos', [['crm:read', 'Ver clientes, leads, tickets y pedidos'], ['crm:write', 'Editar clientes, tickets y pedidos']]],
  ['Productos', [['catalog:read', 'Ver productos y stock'], ['catalog:write', 'Editar productos e importar']]],
  ['Automatizaciones', [['automations:read', 'Ver automatizaciones'], ['automations:write', 'Crear y editar automatizaciones']]],
  ['Aprobaciones de IA', [['approvals:decide', 'Aprobar o rechazar acciones de la IA']]],
  ['Analytics', [['analytics:read', 'Ver estadísticas']]],
  ['Integraciones', [['integrations:read', 'Ver integraciones'], ['integrations:write', 'Configurar canales, API keys y webhooks']]],
  ['Facturación', [['billing:read', 'Ver plan, consumo y facturas']]],
];
const GRANTABLE_SET = new Set(GRANTABLE.flatMap(([, items]) => items.map(([k]) => k)));
// Escribir implica poder leer
const IMPLIES = { 'company:update': ['company:read'], 'agents:write': ['agents:read'], 'conversations:reply': ['conversations:read'], 'knowledge:write': ['knowledge:read'], 'crm:write': ['crm:read'], 'catalog:write': ['catalog:read'], 'automations:write': ['automations:read'], 'integrations:write': ['integrations:read'] };
const normalize = (perms) => [...new Set(perms.flatMap((p) => [p, ...(IMPLIES[p] || [])]))].sort();

const permsFor = (role) => P[role] || [];
const has = (user, perm) => (user?.permissions || []).includes(perm) || (user?.role === 'super_admin' && perm.startsWith('admin:'));
module.exports = { permsFor, has, normalize, GRANTABLE, GRANTABLE_SET, ROLES: ['super_admin', 'company_admin', 'operator', 'viewer'], TEAM_ROLES: ['company_admin', 'operator', 'viewer'] };
