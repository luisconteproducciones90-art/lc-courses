'use strict';
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const E = {
  badRequest: (m, d) => new HttpError(400, 'bad_request', m || 'Solicitud inválida', d),
  unauthorized: (m) => new HttpError(401, 'unauthorized', m || 'No autenticado'),
  forbidden: (m) => new HttpError(403, 'forbidden', m || 'Sin permiso para esta acción'),
  notFound: (m) => new HttpError(404, 'not_found', m || 'No encontrado'),
  conflict: (m) => new HttpError(409, 'conflict', m || 'Conflicto'),
  limit: (m) => new HttpError(402, 'plan_limit', m || 'Límite del plan alcanzado'),
  tooMany: (m) => new HttpError(429, 'too_many_requests', m || 'Demasiadas solicitudes'),
  unsupported: (m) => new HttpError(415, 'unsupported_media_type', m || 'Formato no soportado'),
  notImplemented: (phase) => new HttpError(501, 'not_implemented', `Disponible en la Fase ${phase}`, { phase }),
};
module.exports = { HttpError, E };
