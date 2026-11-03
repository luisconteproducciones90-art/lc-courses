'use strict';
// Registro y resolución del proveedor activo. Las API keys NUNCA salen de env.
const env = require('../../config/env');
const db = require('../../db/pool');
const log = require('../../lib/logger');

const registry = {
  mock: require('./mock'),
  anthropic: require('./anthropic'),
  openai: require('./openai'),
  google: require('./google'),
};

async function getSetting() {
  try {
    const [row] = await db.system((q) => q("SELECT value FROM settings WHERE company_id IS NULL AND key = 'ai_provider'"));
    return row?.value || {};
  } catch { return {}; }
}

/** Devuelve {provider, model}. Si el elegido no tiene clave: mock en desarrollo, error en producción. */
async function resolve() {
  const s = await getSetting();
  const wanted = registry[s.provider] ? s.provider : env.ai.provider;
  let p = registry[wanted] || registry.mock;
  if (!p.isConfigured()) {
    if (env.isProd) throw new Error(`Proveedor de IA "${wanted}" sin clave configurada`);
    log.warn('proveedor de IA sin clave; usando mock', { wanted });
    p = registry.mock;
  }
  return { provider: p, model: (s.models && s.models[p.name]) || p.defaultModel() };
}

function describe() {
  return Object.values(registry).map((p) => ({ name: p.name, configured: p.isConfigured(), defaultModel: p.defaultModel() }));
}

module.exports = { resolve, describe, registry };
