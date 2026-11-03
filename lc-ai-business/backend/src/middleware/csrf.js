'use strict';
const env = require('../config/env');
const { E } = require('../lib/httpError');
const { randomToken, safeEqual } = require('../lib/tokens');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_PREFIXES = ['/api/demo', '/api/webhooks', '/api/widget', '/api/v1']; // sin cookies de sesión: no aplica CSRF
const allowedHosts = new Set([new URL(env.publicUrl).host, ...env.corsOrigins.map((o) => { try { return new URL(o).host; } catch { return o; } })]);

function issueCsrfCookie(res) {
  const token = randomToken(24);
  res.cookie('lc_csrf', token, { httpOnly: false, sameSite: 'lax', secure: env.cookieSecure, path: '/', maxAge: env.refreshTtlSec * 1000 });
  return token;
}

function csrfProtect(req, res, next) {
  if (SAFE.has(req.method) || PUBLIC_PREFIXES.some((p) => req.path.startsWith(p.replace('/api', '')))) return next();
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* inválido */ }
    if (host !== req.get('host') && !allowedHosts.has(host)) return next(E.forbidden('Origen no permitido'));
  }
  const cookie = req.cookies?.lc_csrf;
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) return next(E.forbidden('Token CSRF inválido'));
  next();
}
module.exports = { csrfProtect, issueCsrfCookie };
