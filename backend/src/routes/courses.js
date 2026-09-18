const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, requireAdmin, optionalAuth } = require('../middleware/auth');

// GET /api/courses — listado público con filtros
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, level, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = ['c.is_published = TRUE'];

    if (category) { params.push(category); conditions.push(`cat.slug = $${params.length}`); }
    if (level)    { params.push(level);    conditions.push(`c.level = $${params.length}`); }
    if (search)   { params.push(`%${search}%`); conditions.push(`c.title ILIKE $${params.length}`); }

    const where = conditions.join(' AND ');
    params.push(limit, offset);

    const { rows } = await query(`
      SELECT c.id, c.title, c.slug, c.short_desc, c.icon, c.thumbnail_url,
             c.level, c.duration_hours, c.price, c.original_price,
             c.has_certificate, c.lifetime_access,
             cat.name AS category_name, cat.slug AS category_slug, cat.icon AS category_icon,
             COUNT(DISTINCT e.id) AS enrollments_count
      FROM courses c
      LEFT JOIN categories cat ON cat.id = c.category_id
      LEFT JOIN enrollments e  ON e.course_id = c.id AND e.status = 'active'
      WHERE ${where}
      GROUP BY c.id, cat.name, cat.slug, cat.icon
      ORDER BY c.is_featured DESC, c.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const total = await query(`
      SELECT COUNT(*) FROM courses c
      LEFT JOIN categories cat ON cat.id = c.category_id
      WHERE ${where}
    `, params.slice(0, -2));

    res.json({ courses: rows, total: parseInt(total.rows[0].count), page: +page, limit: +limit });
  } catch (err) {
    console.error('[COURSES/list]', err);
    res.status(500).json({ error: 'Error al obtener cursos' });
  }
});

// GET /api/courses/:slug — detalle público
router.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT c.*, cat.name AS category_name, cat.slug AS category_slug,
             COUNT(DISTINCT e.id) AS enrollments_count
      FROM courses c
      LEFT JOIN categories cat ON cat.id = c.category_id
      LEFT JOIN enrollments e  ON e.course_id = c.id
      WHERE c.slug = $1 AND c.is_published = TRUE
      GROUP BY c.id, cat.name, cat.slug
    `, [req.params.slug]);

    if (!rows.length) return res.status(404).json({ error: 'Curso no encontrado' });
    const course = rows[0];

    // Temario
    const syllabus = await query(
      'SELECT item FROM course_syllabus WHERE course_id = $1 ORDER BY sort_order',
      [course.id]
    );
    course.syllabus = syllabus.rows.map(r => r.item);

    // Módulos y lecciones (sin video_key en público)
    const modules = await query(
      'SELECT id, title, sort_order FROM course_modules WHERE course_id = $1 ORDER BY sort_order',
      [course.id]
    );
    for (const mod of modules.rows) {
      const lessons = await query(`
        SELECT id, title, description, duration_secs, sort_order, is_preview
        FROM lessons WHERE module_id = $1 ORDER BY sort_order
      `, [mod.id]);
      mod.lessons = lessons.rows;
    }
    course.modules = modules.rows;

    // ¿El usuario está inscripto?
    if (req.user) {
      const enrolled = await query(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = $3',
        [req.user.id, course.id, 'active']
      );
      course.is_enrolled = enrolled.rows.length > 0;
    }

    res.json({ course });
  } catch (err) {
    console.error('[COURSES/detail]', err);
    res.status(500).json({ error: 'Error al obtener curso' });
  }
});

// POST /api/courses — admin crea curso
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      title, slug, description, short_desc, icon, category_id,
      level, duration_hours, price, original_price,
      has_certificate = true, lifetime_access = true, is_published = false,
      syllabus = [],
    } = req.body;

    const { rows } = await query(`
      INSERT INTO courses
        (title, slug, description, short_desc, icon, category_id, level,
         duration_hours, price, original_price, has_certificate, lifetime_access, is_published)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [title, slug, description, short_desc, icon, category_id, level,
        duration_hours, price, original_price, has_certificate, lifetime_access, is_published]);

    const course = rows[0];

    if (syllabus.length) {
      for (let i = 0; i < syllabus.length; i++) {
        await query(
          'INSERT INTO course_syllabus (course_id, item, sort_order) VALUES ($1, $2, $3)',
          [course.id, syllabus[i], i]
        );
      }
    }

    res.status(201).json({ course });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug ya existe' });
    console.error('[COURSES/create]', err);
    res.status(500).json({ error: 'Error al crear curso' });
  }
});

// PATCH /api/courses/:id — admin edita curso
router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const fields = ['title','slug','description','short_desc','icon','category_id',
                    'level','duration_hours','price','original_price','is_published',
                    'is_featured','thumbnail_url','intro_video_url'];
    const updates = [];
    const params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]);
        updates.push(`${f} = $${params.length}`);
      }
    });
    if (!updates.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE courses SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Curso no encontrado' });
    res.json({ course: rows[0] });
  } catch (err) {
    console.error('[COURSES/update]', err);
    res.status(500).json({ error: 'Error al actualizar curso' });
  }
});

// DELETE /api/courses/:id — admin elimina curso
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE courses SET is_published = FALSE WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Curso no encontrado' });
    res.json({ message: 'Curso despublicado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar curso' });
  }
});

module.exports = router;
