const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { generateCertificate } = require('../services/certificate');
const emailService = require('../services/email');

// GET /api/enrollments — mis cursos comprados
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT e.id, e.enrolled_at, e.status,
             c.id AS course_id, c.title, c.slug, c.icon, c.duration_hours, c.level,
             cat.name AS category,
             -- progreso
             COUNT(DISTINCT l.id) AS total_lessons,
             COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.is_completed) AS completed_lessons
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN categories cat ON cat.id = c.category_id
      LEFT JOIN lessons l ON l.course_id = c.id
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = e.user_id AND lp.is_completed
      WHERE e.user_id = $1 AND e.status = 'active'
      GROUP BY e.id, c.id, cat.name
      ORDER BY e.enrolled_at DESC
    `, [req.user.id]);

    const enriched = rows.map(r => ({
      ...r,
      progress_pct: r.total_lessons > 0
        ? Math.round((r.completed_lessons / r.total_lessons) * 100)
        : 0,
    }));

    res.json({ enrollments: enriched });
  } catch (err) {
    console.error('[ENROLLMENTS/list]', err);
    res.status(500).json({ error: 'Error al obtener cursos' });
  }
});

// GET /api/enrollments/:course_id/lessons — lecciones de un curso (solo inscriptos)
router.get('/:course_id/lessons', authenticate, async (req, res) => {
  try {
    const { course_id } = req.params;

    // Verificar inscripción
    const { rows: enrolled } = await query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = $3',
      [req.user.id, course_id, 'active']
    );
    if (!enrolled.length) return res.status(403).json({ error: 'No estás inscripto en este curso' });

    const { rows: modules } = await query(
      'SELECT * FROM course_modules WHERE course_id = $1 ORDER BY sort_order',
      [course_id]
    );

    for (const mod of modules) {
      const { rows: lessons } = await query(`
        SELECT l.id, l.title, l.description, l.duration_secs, l.sort_order, l.is_preview,
               lp.is_completed, lp.watch_seconds
        FROM lessons l
        LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
        WHERE l.module_id = $2
        ORDER BY l.sort_order
      `, [req.user.id, mod.id]);
      mod.lessons = lessons;
    }

    res.json({ modules });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener lecciones' });
  }
});

// POST /api/enrollments/:course_id/progress — marcar lección como completada
router.post('/:course_id/progress', authenticate, async (req, res) => {
  try {
    const { course_id } = req.params;
    const { lesson_id, watch_seconds = 0, is_completed = false } = req.body;

    // Verificar inscripción
    const { rows: enrolled } = await query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = $3',
      [req.user.id, course_id, 'active']
    );
    if (!enrolled.length) return res.status(403).json({ error: 'No inscripto' });

    await query(`
      INSERT INTO lesson_progress (user_id, lesson_id, course_id, is_completed, watch_seconds, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, lesson_id)
      DO UPDATE SET
        is_completed = GREATEST(lesson_progress.is_completed, $4),
        watch_seconds = GREATEST(lesson_progress.watch_seconds, $5),
        completed_at = CASE WHEN $4 AND lesson_progress.completed_at IS NULL THEN NOW() ELSE lesson_progress.completed_at END
    `, [req.user.id, lesson_id, course_id, is_completed, watch_seconds,
        is_completed ? new Date() : null]);

    // Verificar si completó todo el curso
    const { rows: prog } = await query(`
      SELECT COUNT(l.id) AS total, COUNT(lp.id) FILTER (WHERE lp.is_completed) AS done
      FROM lessons l
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1 AND lp.is_completed
      WHERE l.course_id = $2
    `, [req.user.id, course_id]);

    const total = parseInt(prog[0].total);
    const done = parseInt(prog[0].done);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    let certificate = null;
    if (pct === 100) {
      try {
        certificate = await generateCertificate({ userId: req.user.id, courseId: course_id });
        // Email de certificado
        const { rows: users } = await query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
        const { rows: courses } = await query('SELECT title FROM courses WHERE id = $1', [course_id]);
        if (users.length && certificate) {
          await emailService.sendCertificateEmail({
            to: users[0].email, name: users[0].name,
            courseName: courses[0].title, certNumber: certificate.cert_number,
            downloadUrl: `${process.env.FRONTEND_URL}/certificados/${certificate.cert_number}`,
          });
        }
      } catch (_) {}
    }

    res.json({ progress_pct: pct, total_lessons: total, completed: done, certificate });
  } catch (err) {
    console.error('[ENROLLMENTS/progress]', err);
    res.status(500).json({ error: 'Error al actualizar progreso' });
  }
});

module.exports = router;
