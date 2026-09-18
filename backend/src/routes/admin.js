const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { query } = require('../config/database');
const emailService = require('../services/email');

// Todas las rutas admin requieren auth + rol admin
router.use(authenticate, requireAdmin);

// GET /api/admin/stats — métricas del dashboard
router.get('/stats', async (req, res) => {
  try {
    const [revenue, students, courses, certs] = await Promise.all([
      query(`SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS count
             FROM orders WHERE status = 'approved'`),
      query(`SELECT COUNT(*) AS count FROM users WHERE role = 'student' AND is_active`),
      query(`SELECT COUNT(*) AS count FROM courses WHERE is_published`),
      query(`SELECT COUNT(*) AS count FROM certificates`),
    ]);

    // Ventas por mes (últimos 6 meses)
    const { rows: monthly } = await query(`
      SELECT DATE_TRUNC('month', created_at) AS month,
             SUM(total) AS revenue, COUNT(*) AS sales
      FROM orders WHERE status = 'approved' AND created_at > NOW() - INTERVAL '6 months'
      GROUP BY month ORDER BY month
    `);

    // Top cursos
    const { rows: topCourses } = await query(`
      SELECT c.title, COUNT(e.id) AS enrollments, SUM(oi.price) AS revenue
      FROM courses c
      JOIN order_items oi ON oi.course_id = c.id
      JOIN orders o ON o.id = oi.order_id AND o.status = 'approved'
      JOIN enrollments e ON e.course_id = c.id
      GROUP BY c.id ORDER BY enrollments DESC LIMIT 5
    `);

    res.json({
      total_revenue: parseInt(revenue.rows[0].total),
      total_sales: parseInt(revenue.rows[0].count),
      total_students: parseInt(students.rows[0].count),
      total_courses: parseInt(courses.rows[0].count),
      total_certificates: parseInt(certs.rows[0].count),
      monthly_revenue: monthly,
      top_courses: topCourses,
    });
  } catch (err) {
    console.error('[ADMIN/stats]', err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// GET /api/admin/students — lista de alumnos
router.get('/students', async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (page - 1) * limit;
    let sql = `
      SELECT u.id, u.name, u.email, u.is_active, u.created_at,
             COUNT(DISTINCT e.id) AS course_count,
             COALESCE(SUM(o.total), 0) AS total_spent
      FROM users u
      LEFT JOIN enrollments e ON e.user_id = u.id
      LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'approved'
      WHERE u.role = 'student'
    `;
    const params = [];
    if (search) { params.push(`%${search}%`); sql += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`; }
    sql += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const { rows } = await query(sql, params);
    res.json({ students: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumnos' });
  }
});

// PATCH /api/admin/students/:id — activar/desactivar alumno
router.patch('/students/:id', async (req, res) => {
  try {
    const { is_active } = req.body;
    const { rows } = await query(
      'UPDATE users SET is_active = $1 WHERE id = $2 AND role = $3 RETURNING id, name, is_active',
      [is_active, req.params.id, 'student']
    );
    if (!rows.length) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json({ student: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar alumno' });
  }
});

// GET /api/admin/orders — órdenes de compra
router.get('/orders', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const params = [limit, offset];
    let where = '';
    if (status) { params.unshift(status); where = 'WHERE o.status = $1'; }

    const { rows } = await query(`
      SELECT o.*, u.name AS user_name, u.email AS user_email,
             json_agg(json_build_object('title', oi.title, 'price', oi.price)) AS items
      FROM orders o
      JOIN users u ON u.id = o.user_id
      JOIN order_items oi ON oi.order_id = o.id
      ${where}
      GROUP BY o.id, u.name, u.email
      ORDER BY o.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    res.json({ orders: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener órdenes' });
  }
});

// PATCH /api/admin/orders/:id/approve — aprobar pago manual (transferencia)
router.patch('/orders/:id/approve', async (req, res) => {
  try {
    await query(`UPDATE orders SET status = 'approved' WHERE id = $1`, [req.params.id]);

    // Inscribir alumno
    const { rows: items } = await query(
      'SELECT oi.course_id, o.user_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.order_id = $1',
      [req.params.id]
    );
    for (const item of items) {
      await query(`
        INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [item.user_id, item.course_id]);
    }

    res.json({ message: 'Orden aprobada y alumno inscripto' });
  } catch (err) {
    res.status(500).json({ error: 'Error al aprobar orden' });
  }
});

// POST /api/admin/emails/mass — envío masivo de emails
router.post('/emails/mass', async (req, res) => {
  try {
    const { segment = 'all', subject, body } = req.body;
    let sql = 'SELECT email FROM users WHERE role = $1 AND is_active';
    const params = ['student'];
    if (segment === 'active') sql += ' AND EXISTS (SELECT 1 FROM enrollments WHERE user_id = users.id)';
    const { rows } = await query(sql, params);
    const emails = rows.map(r => r.email);
    // Fire-and-forget
    emailService.sendMassEmail({ recipients: emails, subject, body });
    res.json({ message: `Enviando a ${emails.length} destinatarios`, count: emails.length });
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar emails' });
  }
});

// POST /api/admin/coupons — crear cupón
router.post('/coupons', async (req, res) => {
  try {
    const { code, discount_pct, max_uses, valid_until } = req.body;
    const { rows } = await query(`
      INSERT INTO coupons (code, discount_pct, max_uses, valid_until)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [code.toUpperCase(), discount_pct, max_uses || null, valid_until || null]);
    res.status(201).json({ coupon: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Código ya existe' });
    res.status(500).json({ error: 'Error al crear cupón' });
  }
});

// GET /api/admin/coupons — listar cupones
router.get('/coupons', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json({ coupons: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cupones' });
  }
});

module.exports = router;
