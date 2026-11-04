'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const log = require('./lib/logger');
const rl = require('./middleware/rateLimit');
const { csrfProtect } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/errors');
const db = require('./db/pool');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.isProd) app.set('trust proxy', 1); // detrás del proxy/HTTPS del hosting

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
      },
    },
    hsts: env.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
  }));

  // HTTPS obligatorio en producción
  if (env.isProd) app.use((req, res, next) => (req.secure || req.path === '/health' ? next() : res.redirect(301, `https://${req.get('host')}${req.originalUrl}`)));

  app.use(express.json({ limit: '300kb', verify: (req, res, buf) => { if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buf; } })); // rawBody: verificación de firmas
  app.use(cookieParser());
  if (!env.isTest) app.use((req, res, next) => { const t = Date.now(); res.on('finish', () => { if (req.path !== '/health') log.info('req', { m: req.method, p: req.path, s: res.statusCode, ms: Date.now() - t }); }); next(); });

  app.get('/health', async (req, res) => {
    try { await db.pool.query('SELECT 1'); res.json({ ok: true, service: 'lc-ai-business' }); } catch { res.status(503).json({ ok: false }); }
  });

  const api = express.Router();
  api.use('/widget', require('./modules/widget')); // público y cross-origin: tiene su propio CORS por empresa (antes del CORS global)
  api.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : false, credentials: true }));
  api.use(rl.general);
  api.use(csrfProtect);
  api.use('/auth', require('./modules/auth'));
  api.use('/companies', require('./modules/companies'));
  api.use('/users', require('./modules/users'));
  api.use('/roles', require('./modules/roles'));
  api.use('/agents', require('./modules/agents'));
  api.use('/conversations', require('./modules/conversations'));
  const { docs, knowledge } = require('./modules/documents');
  api.use('/documents', docs);
  api.use('/knowledge', knowledge);
  api.use('/analytics', require('./modules/analytics'));
  api.use('/ai', require('./modules/ai'));
  api.use('/admin', require('./modules/admin'));
  api.use('/demo', require('./modules/demo'));
  api.use('/webhooks', require('./modules/webhooksIn'));
  api.use('/v1', require('./modules/apiV1'));
  api.use('/whatsapp', require('./modules/whatsapp'));
  api.use('/integrations', require('./modules/integrations'));
  api.use('/billing', require('./modules/billing'));
  api.use('/marketplace', require('./modules/marketplace'));
  api.use('/products', require('./modules/products'));
  const crm = require('./modules/customers');
  api.use('/customers', crm.customers);
  api.use('/leads', crm.leads);
  api.use('/tickets', require('./modules/tickets'));
  const ord = require('./modules/orders');
  api.use('/orders', ord.orders);
  api.use('/approvals', ord.approvals);
  api.use('/automations', require('./modules/automations'));
  api.use('/notifications', require('./modules/notifications'));
  for (const [p, r] of require('./modules/planned')) api.use(p, r);
  api.use(notFound);
  app.use('/api', api);

  // Frontend estático (mismo origen: simplifica cookies/CSRF y el despliegue en un subdominio)
  if (fs.existsSync(path.join(env.frontendDir, 'index.html'))) {
    app.use(express.static(env.frontendDir, {
      index: false, maxAge: env.isProd ? '1h' : 0,
      setHeaders: (res, file) => { if (file.endsWith('lc-ai-widget.js')) { res.set('Cross-Origin-Resource-Policy', 'cross-origin'); res.set('Access-Control-Allow-Origin', '*'); } }, // el widget se carga desde sitios de terceros
    }));
    app.get('*', (req, res, next) => (req.path.startsWith('/api/') ? next() : res.sendFile(path.join(env.frontendDir, 'index.html'))));
  }
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
