'use strict';
// Bus de eventos de dominio: automatizaciones + webhooks salientes. Nunca lanza.
const automations = require('./automations');
const log = require('../lib/logger');

async function emit(companyId, event, payload = {}) {
  let outbound = [];
  try { outbound = await automations.fire(companyId, event, payload); } catch (e) { log.error('emit automations', { err: e.message }); }
  try { await require('./webhooks').dispatch(companyId, event, payload); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') log.error('emit webhooks', { err: e.message }); }
  return outbound;
}
module.exports = { emit };
