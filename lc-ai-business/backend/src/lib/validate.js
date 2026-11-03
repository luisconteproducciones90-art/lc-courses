'use strict';
const { z } = require('zod');
const { E } = require('./httpError');

/** Valida y devuelve datos tipados; lanza 400 con detalle por campo. */
function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw E.badRequest('Datos inválidos', details);
  }
  return r.data;
}
const id = z.uuid();
const str = (max, min = 0) => z.string().trim().min(min).max(max);
module.exports = { z, parse, id, str };
