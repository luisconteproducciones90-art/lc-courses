const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function generateTokens(userId) {
  const access = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
  const refresh = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
  return { access, refresh };
}

// POST /api/auth/register
router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { name, email, password } = req.body;
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (name, email, password) VALUES ($1, $2, $3)
       RETURNING id, name, email, role, created_at`,
      [name, email, hash]
    );
    const user = rows[0];
    const tokens = generateTokens(user.id);
    res.status(201).json({ user, ...tokens });
  } catch (err) {
    console.error('[AUTH/register]', err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { email, password } = req.body;
    const { rows } = await query(
      'SELECT id, name, email, password, role, is_active FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Cuenta deshabilitada' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    const { password: _, ...safeUser } = user;
    const tokens = generateTokens(user.id);
    res.json({ user: safeUser, ...tokens });
  } catch (err) {
    console.error('[AUTH/login]', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    let { rows } = await query(
      'SELECT id, name, email, role, is_active FROM users WHERE google_id = $1 OR email = $2',
      [googleId, email]
    );
    let user = rows[0];

    if (!user) {
      const insert = await query(
        `INSERT INTO users (name, email, google_id, avatar_url)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, role, is_active`,
        [name, email, googleId, picture]
      );
      user = insert.rows[0];
    } else if (!user.google_id) {
      await query('UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3',
        [googleId, picture, user.id]);
    }

    if (!user.is_active) return res.status(403).json({ error: 'Cuenta deshabilitada' });
    const tokens = generateTokens(user.id);
    res.json({ user, ...tokens });
  } catch (err) {
    console.error('[AUTH/google]', err);
    res.status(401).json({ error: 'Token de Google inválido' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refresh } = req.body;
    if (!refresh) return res.status(400).json({ error: 'Refresh token requerido' });
    const decoded = jwt.verify(refresh, process.env.JWT_REFRESH_SECRET);
    const tokens = generateTokens(decoded.id);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
