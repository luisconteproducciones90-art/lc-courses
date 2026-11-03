'use strict';
const db = require('../db/pool');
const log = require('./logger');

/** Registra una acción administrativa. Nunca rompe la request si falla. */
async function audit(req, action, entity = '', entityId = '', meta = {}, companyIdOverride) {
  const companyId = companyIdOverride !== undefined ? companyIdOverride : req.user?.companyId || null;
  try {
    await db.system((q) =>
      q('INSERT INTO audit_logs (company_id, user_id, action, entity, entity_id, ip, meta) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
        companyId, req.user?.id || null, action, entity, String(entityId || ''), req.ip || '', JSON.stringify(log.redact(meta)),
      ]));
  } catch (e) {
    log.error('audit failed', { err: e.message, action });
  }
}
module.exports = { audit };
