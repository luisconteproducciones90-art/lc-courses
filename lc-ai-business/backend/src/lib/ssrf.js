'use strict';
// Salida HTTP segura (SSRF): solo http/https, resuelve DNS y rechaza IPs privadas/loopback/metadata EN LA CONEXIÓN
// (evita DNS rebinding), límites de tiempo y tamaño, sin seguir redirecciones automáticamente.
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const env = require('../config/env');
const { E } = require('./httpError');

function isPrivateIp(ip) {
  if (env.allowPrivateUrls) return false;
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::' || l === '::1' || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb') || l.startsWith('fc') || l.startsWith('fd')) return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateIp(m[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function safeLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return cb(new Error('Destino no permitido'));
    return options.all ? cb(null, addrs) : cb(null, addrs[0].address, addrs[0].family);
  });
}

function validateUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw E.badRequest('URL inválida'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw E.badRequest('Solo se permiten URLs http(s)');
  if (u.username || u.password) throw E.badRequest('La URL no puede incluir credenciales');
  if (net.isIP(u.hostname) && isPrivateIp(u.hostname.replace(/^\[|\]$/g, ''))) throw E.badRequest('Destino no permitido');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname) && !env.allowPrivateUrls) throw E.badRequest('Destino no permitido');
  return u;
}

function safeFetch(raw, { method = 'GET', headers = {}, body, timeoutMs = 10000, maxBytes = 2 * 1024 * 1024 } = {}) {
  const u = validateUrl(raw);
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method, headers, lookup: safeLookup, timeout: timeoutMs }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > maxBytes) { req.destroy(new Error('Respuesta demasiado grande')); return; } chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado')));
    req.on('error', (e) => reject(e.message === 'Destino no permitido' ? E.badRequest('Destino no permitido') : e));
    if (body) req.write(body);
    req.end();
  });
}
module.exports = { safeFetch, validateUrl, isPrivateIp };
