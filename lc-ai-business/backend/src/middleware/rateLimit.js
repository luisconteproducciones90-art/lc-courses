'use strict';
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const mk = (windowMs, max, message, keyGenerator) =>
  rateLimit({
    windowMs, max: env.isTest ? 100000 : max, standardHeaders: true, legacyHeaders: false,
    message: { error: { code: 'too_many_requests', message } },
    ...(keyGenerator ? { keyGenerator } : {}),
  });

module.exports = {
  general: mk(60_000, 300, 'Demasiadas solicitudes. Esperá un momento.'),
  auth: mk(15 * 60_000, 30, 'Demasiados intentos. Probá de nuevo en unos minutos.'),
  chat: mk(60_000, 30, 'Estás enviando mensajes muy rápido.', (req) => req.user?.id || req.ip),
  demo: mk(60_000, 12, 'Límite de la demo alcanzado. Esperá un minuto.'),
  widget: mk(60_000, 40, 'Estás enviando mensajes muy rápido.'),
  api: mk(60_000, 300, 'Límite de la API alcanzado.', (req) => req.apiKeyId || req.ip),
  webhook: mk(60_000, 600, 'Demasiados eventos.'),
  upload: mk(60_000, 20, 'Demasiadas cargas. Esperá un momento.', (req) => req.user?.id || req.ip),
};
