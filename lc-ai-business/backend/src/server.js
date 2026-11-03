'use strict';
const env = require('./config/env');
const log = require('./lib/logger');
const db = require('./db/pool');
const { migrate } = require('./db/migrate');
const { createApp } = require('./app');

(async () => {
  await migrate();
  await db.checkRole();
  const server = createApp().listen(env.port, () => log.info('LC-AI BUSINESS escuchando', { port: env.port, env: env.isProd ? 'production' : 'development' }));
  const stop = () => server.close(() => db.close().then(() => process.exit(0)));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
})().catch((e) => { log.error('arranque fallido', { err: e.message }); process.exit(1); });
