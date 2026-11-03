'use strict';
const { E } = require('./httpError');

// Cuenta de recursos y límites por plan. -1 / ausente = sin límite.
const COUNTERS = {
  users: "SELECT count(*)::int n FROM users WHERE status = 'active'",
  agents: 'SELECT count(*)::int n FROM agents',
  documents: 'SELECT count(*)::int n FROM documents',
};
async function assertLimit(q, companyId, resource) {
  const [row] = await q('SELECT p.limits, p.name FROM companies c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = $1', [companyId]);
  const max = row?.limits?.[resource];
  if (max === undefined || max === null || max < 0) return;
  const [{ n }] = await q(COUNTERS[resource]);
  if (n >= max) throw E.limit(`Tu plan ${row.name} permite hasta ${max} ${resource}. Actualizá el plan para agregar más.`);
}
module.exports = { assertLimit };
