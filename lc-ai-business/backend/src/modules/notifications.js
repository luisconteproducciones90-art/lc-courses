'use strict';
const express = require('express');
const db = require('../db/pool');
const { wrap } = require('../middleware/errors');
const { authenticate } = require('../middleware/auth');
const { parse, id } = require('../lib/validate');

const router = express.Router();
router.use(authenticate);
const need = (req, res, next) => (req.user.companyId ? next() : res.status(403).json({ error: { code: 'forbidden', message: 'Requiere una empresa' } }));
router.use(need);
router.get('/', wrap(async (req, res) => {
  const out = await db.tenant(req.user.companyId, async (q) => ({ notifications: await q('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 60'), unread: (await q('SELECT count(*)::int n FROM notifications WHERE read_at IS NULL'))[0].n }));
  res.json(out);
}));
router.post('/read-all', wrap(async (req, res) => { await db.tenant(req.user.companyId, (q) => q('UPDATE notifications SET read_at = now() WHERE read_at IS NULL')); res.json({ ok: true }); }));
router.post('/:id/read', wrap(async (req, res) => { const nid = parse(id, req.params.id); await db.tenant(req.user.companyId, (q) => q('UPDATE notifications SET read_at = now() WHERE id = $1', [nid])); res.json({ ok: true }); }));
module.exports = router;
