'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

const signAccess = (user) =>
  jwt.sign({ sub: user.id, cid: user.company_id || null, role: user.role }, env.jwtSecret, {
    algorithm: 'HS256', expiresIn: env.accessTtlSec, issuer: 'lc-ai-business',
  });
const verifyAccess = (token) => jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'], issuer: 'lc-ai-business' });

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { sha256, randomToken, signAccess, verifyAccess, safeEqual };
