'use strict';
// Registro de handlers de la cola (un solo lugar; evita dependencias circulares).
const queue = require('./queue');
queue.register('whatsapp.inbound', ({ body }, job) => require('./whatsapp').processBody(job.company_id, body));
queue.register('webhook.deliver', (payload, job) => require('./webhooks').deliver(payload, job));
module.exports = queue;
