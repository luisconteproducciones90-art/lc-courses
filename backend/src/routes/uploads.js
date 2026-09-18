const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getUploadPresignedUrl, getStreamingUrl } = require('../services/r2');
const { query } = require('../config/database');

// POST /api/uploads/video-url — admin obtiene URL firmada para subir video a R2
router.post('/video-url', authenticate, requireAdmin, async (req, res) => {
  try {
    const { content_type = 'video/mp4', extension = 'mp4' } = req.body;
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowed.includes(content_type)) {
      return res.status(400).json({ error: 'Tipo de archivo no permitido' });
    }
    const { url, key } = await getUploadPresignedUrl({
      folder: 'videos',
      contentType: content_type,
      extension,
    });
    res.json({ upload_url: url, key });
  } catch (err) {
    console.error('[UPLOAD/video-url]', err);
    res.status(500).json({ error: 'Error al generar URL de subida' });
  }
});

// POST /api/uploads/thumbnail-url — admin sube imagen de curso
router.post('/thumbnail-url', authenticate, requireAdmin, async (req, res) => {
  try {
    const { extension = 'jpg' } = req.body;
    const { url, key } = await getUploadPresignedUrl({
      folder: 'thumbnails',
      contentType: `image/${extension === 'png' ? 'png' : 'jpeg'}`,
      extension,
    });
    res.json({ upload_url: url, key });
  } catch (err) {
    res.status(500).json({ error: 'Error al generar URL de subida' });
  }
});

// POST /api/uploads/material-url — admin sube material descargable
router.post('/material-url', authenticate, requireAdmin, async (req, res) => {
  try {
    const { content_type, extension, course_id, title } = req.body;
    const { url, key } = await getUploadPresignedUrl({
      folder: 'materials',
      contentType: content_type,
      extension,
    });
    // Registrar material en BD
    await query(
      `INSERT INTO course_materials (course_id, title, file_key, file_type)
       VALUES ($1, $2, $3, $4)`,
      [course_id, title, key, extension]
    );
    res.json({ upload_url: url, key });
  } catch (err) {
    res.status(500).json({ error: 'Error al generar URL de subida' });
  }
});

// GET /api/uploads/stream/:lesson_id — alumno obtiene URL de streaming
router.get('/stream/:lesson_id', authenticate, async (req, res) => {
  try {
    const { lesson_id } = req.params;

    // Verificar que el alumno esté inscripto en el curso de esta lección
    const { rows } = await query(`
      SELECT l.video_key, l.course_id
      FROM lessons l
      JOIN enrollments e ON e.course_id = l.course_id
      WHERE l.id = $1 AND e.user_id = $2 AND e.status = 'active'
    `, [lesson_id, req.user.id]);

    // También permitir si la lección es preview
    const { rows: preview } = await query(
      'SELECT video_key FROM lessons WHERE id = $1 AND is_preview = TRUE',
      [lesson_id]
    );

    const lesson = rows[0] || preview[0];
    if (!lesson?.video_key) {
      return res.status(403).json({ error: 'No tienes acceso a esta lección' });
    }

    const streamUrl = await getStreamingUrl(lesson.video_key);

    // Registrar reproducción en progreso
    if (rows[0]) {
      await query(`
        INSERT INTO lesson_progress (user_id, lesson_id, course_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, lesson_id) DO NOTHING
      `, [req.user.id, lesson_id, rows[0].course_id]);
    }

    res.json({ stream_url: streamUrl, expires_in: 7200 });
  } catch (err) {
    console.error('[UPLOAD/stream]', err);
    res.status(500).json({ error: 'Error al obtener URL de streaming' });
  }
});

module.exports = router;
