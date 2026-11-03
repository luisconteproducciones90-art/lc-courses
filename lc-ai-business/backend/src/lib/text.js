'use strict';
// Sanitización de texto de entrada: sin caracteres de control, longitud acotada.
// (El escape para HTML se hace en el frontend vía textContent; aquí se limpia lo que se guarda.)
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
function clean(s, max = 5000) {
  return String(s ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').trim().slice(0, max);
}
module.exports = { clean };
