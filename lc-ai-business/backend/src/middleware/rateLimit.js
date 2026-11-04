'use strict';
// Limitadores de tasa. Con REDIS_URL el contador se comparte entre instancias; sin Redis es por proceso.
// Si Redis se cae, los limitadores "fallan abiertos" (la app sigue atendiendo) y se registra el error.
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const log = require('../lib/logger');

const clients = new Map(); let RedisStore = null;
function redisClient(url) {
  if (clients.has(url)) return clients.get(url);
  const { createClient } = require('redis');
  const client = createClient({ url, disableOfflineQueue: true, socket: { reconnectStrategy: (n) => Math.min(n * 200, 5000), connectTimeout: 3000 } });
  client.on('error', (e) => log.error('redis', { err: e.message }));
  client.connect().catch(() => { /* reintenta solo; mientras tanto fallan abiertos */ });
  clients.set(url, client);
  return client;
}

// Store diferido: crea el RedisStore recién cuando Redis está listo. El RedisStore original carga un script Lua
// al construirse y, si Redis estaba caído en el arranque, eso tiraba un rechazo sin manejar (caída del proceso).
class LazyRedisStore {
  constructor(client, prefix) { this.client = client; this.prefix = prefix; this.inner = null; this.options = null; }
  init(options) { this.options = options; }
  async ensure() {
    if (!this.client.isReady) throw new Error('Redis no disponible');
    if (!this.inner) {
      const inner = new RedisStore({ prefix: this.prefix, sendCommand: (...args) => this.client.sendCommand(args) });
      inner.init(this.options);
      inner.incrementScriptSha?.catch(() => { if (this.inner === inner) this.inner = null; }); // si la carga falla, se reintenta en el próximo pedido
      this.inner = inner;
    }
    return this.inner;
  }
  async increment(key) { return (await this.ensure()).increment(key); }
  async decrement(key) { return (await this.ensure()).decrement(key); }
  async resetKey(key) { return (await this.ensure()).resetKey(key); }
}

function buildLimiter({ name, windowMs, max, message, keyGenerator, redisUrl = env.redisUrl, ignoreTest = false }) {
  const opts = {
    windowMs, max: env.isTest && !ignoreTest ? 100000 : max, standardHeaders: true, legacyHeaders: false, passOnStoreError: true,
    message: { error: { code: 'too_many_requests', message } }, ...(keyGenerator ? { keyGenerator } : {}),
  };
  if (redisUrl) {
    RedisStore = RedisStore || require('rate-limit-redis').RedisStore;
    const client = redisClient(redisUrl);
    opts.store = new LazyRedisStore(client, `lcb:rl:${name}:`);
  }
  return rateLimit(opts);
}
const mk = (name, windowMs, max, message, keyGenerator) => buildLimiter({ name, windowMs, max, message, keyGenerator });

async function waitRedis(url, ms = 3000) { // espera a que el cliente conecte (arranque y tests)
  const c = clients.get(url); const t0 = Date.now();
  while (c && !c.isReady && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25));
  return !!c?.isReady;
}

async function closeRedis() { // cierra todo: los clientes que nunca conectaron se desconectan sin esperar
  for (const c of clients.values()) { if (c.isReady) await c.quit().catch(() => c.disconnect()); else await c.disconnect().catch(() => {}); }
  clients.clear();
}

module.exports = {
  general: mk('general', 60_000, 300, 'Demasiadas solicitudes. Esperá un momento.'),
  auth: mk('auth', 15 * 60_000, 30, 'Demasiados intentos. Probá de nuevo en unos minutos.'),
  chat: mk('chat', 60_000, 30, 'Estás enviando mensajes muy rápido.', (req) => req.user?.id || req.ip),
  demo: mk('demo', 60_000, 12, 'Límite de la demo alcanzado. Esperá un minuto.'),
  widget: mk('widget', 60_000, 40, 'Estás enviando mensajes muy rápido.'),
  api: mk('api', 60_000, 300, 'Límite de la API alcanzado.', (req) => req.apiKeyId || req.ip),
  webhook: mk('webhook', 60_000, 600, 'Demasiados eventos.'),
  upload: mk('upload', 60_000, 20, 'Demasiadas cargas. Esperá un momento.', (req) => req.user?.id || req.ip),
  buildLimiter, closeRedis, waitRedis,
};
