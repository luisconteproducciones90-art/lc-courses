'use strict';
const env = require('./config/env');
const log = require('./lib/logger');
const db = require('./db/pool');
const { migrate } = require('./db/migrate');
const { createApp } = require('./app');

(async () => {
  await migrate();
  if (process.env.AUTO_SEED === 'true') { // primer arranque sin consola: planes, demo, plantillas y SUPER ADMIN (idempotente)
    const { seedAll } = require('./db/seed'); await seedAll(); log.info('seed inicial aplicado');
  }
  await db.checkRole();
  const queue = require('./services/jobs'); queue.start(); queue.kick(); // reanuda lo pendiente tras un reinicio
  const automations = require('./services/automations');
  const tick = setInterval(() => automations.runInactiveCustomers().catch((e) => log.error('scheduler', { err: e.message })), 30 * 60 * 1000);
  tick.unref();
  const sync = setInterval(() => require('./services/connectors').runAutoSyncs().catch((e) => log.error('autosync', { err: e.message })), 30 * 60 * 1000);
  sync.unref();
  const server = createApp().listen(env.port, () => log.info('LC-AI BUSINESS escuchando', { port: env.port, env: env.isProd ? 'production' : 'development' }));
  const stop = () => queue.stop() || server.close(() => require('./middleware/rateLimit').closeRedis().then(() => db.close()).then(() => process.exit(0)));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
})().catch((e) => { log.error('arranque fallido', { err: e.message }); process.exit(1); });
