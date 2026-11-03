'use strict';
// Especificación OpenAPI 3.0 de la API pública v1 (ecosistema LC: LC-SYSTEM BUSINESS, LC-ECOMMERCE, LC-PEDIDOS, LC-PREVIEWS).
const env = require('../config/env');
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ok = (schema, desc = 'OK') => ({ 200: { description: desc, ...json(schema) } });
const product = { type: 'object', properties: { sku: { type: 'string' }, code: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, price: { type: 'string', description: 'Decimal' }, stock: { type: 'integer' }, stock_min: { type: 'integer' }, brand: { type: 'string' }, supplier: { type: 'string' }, status: { type: 'string' } } };
const sec = [{ bearer: [] }];

module.exports = () => ({
  openapi: '3.0.3',
  info: { title: 'LC-AI BUSINESS API v1', version: '1.0.0', description: 'API para conectar el ecosistema LC-SYSTEM. Autenticación con API key por empresa (Authorization: Bearer lcb_sk_…) y permisos por scope.' },
  servers: [{ url: `${env.publicUrl}/api/v1` }],
  components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
  security: sec,
  paths: {
    '/products': { get: { summary: 'Listar productos', description: 'Scope: products:read', parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 500 } }, { name: 'offset', in: 'query', schema: { type: 'integer' } }], responses: ok({ type: 'object', properties: { products: { type: 'array', items: product } } }) } },
    '/products/sync': { post: { summary: 'Alta/actualización masiva por SKU', description: 'Scope: products:write. Hasta 2000 ítems. Campos ausentes no se pisan.', requestBody: { required: true, ...json({ type: 'object', required: ['products'], properties: { products: { type: 'array', items: { ...product, required: ['sku', 'name'] } } } }) }, responses: ok({ type: 'object', properties: { created: { type: 'integer' }, updated: { type: 'integer' }, skipped: { type: 'integer' }, errors: { type: 'array', items: { type: 'string' } } } }) } },
    '/products/{sku}/stock': {
      get: { summary: 'Stock de un producto', description: 'Scope: stock:read', parameters: [{ name: 'sku', in: 'path', required: true, schema: { type: 'string' } }], responses: ok({ type: 'object', properties: { sku: { type: 'string' }, stock: { type: 'integer' }, availability: { type: 'string', enum: ['disponible', 'últimas unidades', 'sin stock'] } } }) },
      patch: { summary: 'Actualizar stock', description: 'Scope: products:write. Dispara el evento stock.low si cruza el mínimo.', parameters: [{ name: 'sku', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, ...json({ type: 'object', required: ['stock'], properties: { stock: { type: 'integer' } } }) }, responses: ok({ type: 'object' }) },
    },
    '/customers': { get: { summary: 'Listar clientes', description: 'Scope: customers:read', responses: ok({ type: 'object' }) } },
    '/customers/sync': { post: { summary: 'Alta/actualización de clientes', description: 'Scope: customers:write. Se unifica por teléfono, WhatsApp o email.', requestBody: { required: true, ...json({ type: 'object', required: ['customers'], properties: { customers: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, whatsapp: { type: 'string' }, email: { type: 'string' }, external_ref: { type: 'string' }, last_purchase_at: { type: 'string', format: 'date-time' } } } } } }) }, responses: ok({ type: 'object', properties: { created: { type: 'integer' }, updated: { type: 'integer' } } }) } },
    '/orders': {
      get: { summary: 'Listar presupuestos y pedidos', description: 'Scope: orders:read', parameters: [{ name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' } }], responses: ok({ type: 'object' }) },
      post: { summary: 'Crear presupuesto o pedido', description: 'Scope: orders:write. Los precios los calcula LC-AI BUSINESS desde el catálogo.', requestBody: { required: true, ...json({ type: 'object', required: ['kind', 'items'], properties: { kind: { type: 'string', enum: ['quote', 'order'] }, items: { type: 'array', items: { type: 'object', required: ['sku', 'qty'], properties: { sku: { type: 'string' }, qty: { type: 'integer' } } } }, notes: { type: 'string' } } }) }, responses: { 201: { description: 'Creado' } } },
    },
    '/conversations': { get: { summary: 'Conversaciones', description: 'Scope: conversations:read', parameters: [{ name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' } }], responses: ok({ type: 'object' }) } },
  },
  'x-webhooks': {
    description: 'Webhooks salientes: POST JSON {id, event, created_at, data}. Cabeceras X-LC-Event, X-LC-Timestamp, X-LC-Signature = sha256=HMAC_SHA256(secret, "<timestamp>.<body>"). Rechazá eventos con timestamp viejo (> 5 min).',
    events: ['conversation.handoff', 'lead.created', 'quote.requested', 'order.created', 'stock.low', 'customer.created'],
  },
});
