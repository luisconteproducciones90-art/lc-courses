'use strict';
// Reservado: la capa AIProvider ya admite sumar Google (Gemini) implementando generate().
module.exports = {
  name: 'google',
  isConfigured: () => false,
  defaultModel: () => '',
  async generate() { throw new Error('Proveedor Google aún no implementado'); },
};
