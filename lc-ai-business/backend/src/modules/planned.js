'use strict';
// Contrato de API visible desde el día 1: estas rutas existen y responden 501 hasta su fase.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { E } = require('../lib/httpError');

const PLAN = { customers: 2, products: 2, automations: 2, integrations: 3, whatsapp: 3, webhooks: 3 };
module.exports = Object.entries(PLAN).map(([name, phase]) => {
  const r = express.Router();
  if (name !== 'webhooks') r.use(authenticate);
  r.use((req, res, next) => next(E.notImplemented(phase)));
  return [`/${name}`, r];
});
