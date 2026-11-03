'use strict';
const { HttpError } = require('../lib/httpError');
const log = require('../lib/logger');

function notFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Ruta no encontrada' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'payload_too_large', message: 'El contenido es demasiado grande' } });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'bad_json', message: 'JSON inválido' } });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'file_too_large', message: 'El archivo supera el tamaño máximo (5 MB)' } });
  if (err.code === '23505') return res.status(409).json({ error: { code: 'conflict', message: 'Ya existe un registro con esos datos' } });
  if (err.code === '22P02') return res.status(400).json({ error: { code: 'bad_request', message: 'Identificador inválido' } });
  log.error('unhandled', { path: req.path, method: req.method, err: err.message, stack: err.stack });
  res.status(500).json({ error: { code: 'internal', message: 'Error interno. Reintentá en unos instantes.' } });
}

// Express 4 no captura promesas rechazadas: envoltorio.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { notFound, errorHandler, wrap };
