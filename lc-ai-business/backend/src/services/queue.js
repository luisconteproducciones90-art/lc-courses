'use strict';
// Cola de trabajos durable sobre PostgreSQL (FOR UPDATE SKIP LOCKED): sobrevive a reinicios y a varias instancias.
// enqueue() dispara el procesamiento enseguida (camino rápido) y un sondeo periódico recoge reintentos y huérfanos.
const db = require('../db/pool');
const log = require('../lib/logger');

const handlers = new Map();
const inflight = new Set();
let timer = null;
const STALE_MS = 5 * 60 * 1000;
const backoffSec = (attempt) => Math.min(3600, 5 * 2 ** attempt); // 10 s, 20 s, 40 s, 80 s…

const register = (kind, fn) => handlers.set(kind, fn);

async function enqueue(kind, companyId, payload, { delaySec = 0, maxAttempts = 5 } = {}) {
  const [j] = await db.system((q) => q("INSERT INTO jobs (kind, company_id, payload, max_attempts, run_at) VALUES ($1,$2,$3,$4, now() + ($5 || ' seconds')::interval) RETURNING id", [kind, companyId || null, JSON.stringify(payload), maxAttempts, String(delaySec)]));
  if (!delaySec) kick();
  return j.id;
}

async function claim() {
  const [j] = await db.system((q) => q(`UPDATE jobs SET status = 'running', locked_at = now(), attempts = attempts + 1
    WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_at <= now() ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`));
  return j || null;
}

async function runOne(j) {
  const fn = handlers.get(j.kind);
  try {
    if (!fn) throw new Error(`sin handler para ${j.kind}`);
    await fn(j.payload, j);
    await db.system((q) => q("UPDATE jobs SET status = 'done', finished_at = now(), locked_at = NULL, last_error = '' WHERE id = $1", [j.id]));
  } catch (e) {
    const final = j.attempts >= j.max_attempts || e.permanent;
    await db.system((q) => q(`UPDATE jobs SET status = $2, locked_at = NULL, last_error = $3, finished_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END,
      run_at = CASE WHEN $2 = 'queued' THEN now() + ($4 || ' seconds')::interval ELSE run_at END WHERE id = $1`, [j.id, final ? 'failed' : 'queued', String(e.message).slice(0, 300), String(backoffSec(j.attempts))]));
    if (final) log.error('job fallido definitivamente', { kind: j.kind, id: j.id, err: e.message });
  }
}

/** Procesa todo lo que ya venció. Devuelve cuántos trabajos corrió. */
async function runDue(limit = 100) {
  let n = 0;
  await db.system((q) => q("UPDATE jobs SET status = 'queued' WHERE status = 'running' AND locked_at < now() - ($1 || ' milliseconds')::interval", [String(STALE_MS)])); // recupera huérfanos de un proceso caído
  for (; n < limit; n += 1) { const j = await claim(); if (!j) break; await runOne(j); }
  return n;
}

function kick() {
  const p = runDue().catch((e) => log.error('queue', { err: e.message })).finally(() => inflight.delete(p));
  inflight.add(p);
  return p;
}
const idle = async () => { while (inflight.size) await Promise.all([...inflight]); };
function start(intervalMs = 15000) { if (!timer) { timer = setInterval(kick, intervalMs); timer.unref(); } }
function stop() { if (timer) { clearInterval(timer); timer = null; } }

async function stats() {
  const by = await db.system((q) => q("SELECT status, count(*)::int n FROM jobs GROUP BY 1"));
  const failed = await db.system((q) => q("SELECT id, kind, attempts, last_error, finished_at FROM jobs WHERE status = 'failed' ORDER BY finished_at DESC LIMIT 10"));
  return { counts: Object.fromEntries(by.map((r) => [r.status, r.n])), failed };
}

module.exports = { register, enqueue, runDue, kick, idle, start, stop, stats };
