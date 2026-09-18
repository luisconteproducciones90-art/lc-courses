const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { query, transaction } = require('../config/database');
const { authenticate } = require('../middleware/auth');

// Inicializar SDK de Mercado Pago
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 },
});

// POST /api/payments/preference — crear preferencia de pago
router.post('/preference', authenticate, async (req, res) => {
  try {
    const { items, coupon_code } = req.body;
    const user = req.user;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'Sin items en el carrito' });
    }

    // Validar cursos y calcular total
    let subtotal = 0;
    const courseIds = items.map(i => i.course_id);
    const placeholders = courseIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: courses } = await query(
      `SELECT id, title, price FROM courses WHERE id IN (${placeholders}) AND is_published = TRUE`,
      courseIds
    );

    if (courses.length !== courseIds.length) {
      return res.status(400).json({ error: 'Uno o más cursos no existen o no están disponibles' });
    }

    // Verificar que no esté ya inscripto
    for (const course of courses) {
      const enrolled = await query(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
        [user.id, course.id]
      );
      if (enrolled.rows.length) {
        return res.status(409).json({ error: `Ya estás inscripto en: ${course.title}` });
      }
      subtotal += course.price;
    }

    // Aplicar cupón
    let discount = 0;
    let couponRow = null;
    if (coupon_code) {
      const { rows: coupons } = await query(`
        SELECT * FROM coupons
        WHERE code = $1 AND is_active = TRUE
          AND (valid_until IS NULL OR valid_until > NOW())
          AND (max_uses IS NULL OR used_count < max_uses)
      `, [coupon_code.toUpperCase()]);
      if (coupons.length) {
        couponRow = coupons[0];
        discount = Math.round(subtotal * couponRow.discount_pct / 100);
      }
    }
    const total = subtotal - discount;

    // Crear orden en BD
    const order = await transaction(async (client) => {
      const { rows } = await client.query(`
        INSERT INTO orders (user_id, status, subtotal, discount_amount, total, coupon_code, payment_method)
        VALUES ($1, 'pending', $2, $3, $4, $5, 'mercadopago')
        RETURNING *
      `, [user.id, subtotal, discount, total, coupon_code || null]);
      const ord = rows[0];

      for (const course of courses) {
        await client.query(
          'INSERT INTO order_items (order_id, course_id, title, price) VALUES ($1,$2,$3,$4)',
          [ord.id, course.id, course.title, course.price]
        );
      }

      if (couponRow) {
        await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [couponRow.id]);
      }

      return ord;
    });

    // Crear preferencia en Mercado Pago
    const preference = new Preference(mpClient);
    const preferenceData = await preference.create({
      body: {
        items: courses.map(c => ({
          id: c.id,
          title: c.title,
          quantity: 1,
          unit_price: c.price / 100,  // MP trabaja con pesos, no centavos
          currency_id: 'ARS',
        })),
        payer: {
          name: user.name,
          email: user.email,
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pago/exitoso?order=${order.id}`,
          failure: `${process.env.FRONTEND_URL}/pago/fallido?order=${order.id}`,
          pending: `${process.env.FRONTEND_URL}/pago/pendiente?order=${order.id}`,
        },
        auto_return: 'approved',
        external_reference: order.id,
        notification_url: `${process.env.BACKEND_URL || 'https://api.lccourses.com'}/api/webhooks/mercadopago`,
        metadata: {
          order_id: order.id,
          user_id: user.id,
        },
        payment_methods: {
          excluded_payment_methods: [],
          installments: 12,
        },
        statement_descriptor: 'LC-COURSES',
      },
    });

    // Guardar preference_id en orden
    await query(
      'UPDATE orders SET mp_preference_id = $1 WHERE id = $2',
      [preferenceData.id, order.id]
    );

    res.json({
      preference_id: preferenceData.id,
      init_point: preferenceData.init_point,        // redirect para pago
      sandbox_init_point: preferenceData.sandbox_init_point,
      order_id: order.id,
      total,
    });
  } catch (err) {
    console.error('[PAYMENT/preference]', err);
    res.status(500).json({ error: 'Error al crear preferencia de pago' });
  }
});

// GET /api/payments/order/:id — estado de una orden
router.get('/order/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT o.*, 
        json_agg(json_build_object('course_id', oi.course_id, 'title', oi.title, 'price', oi.price)) AS items
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = $1 AND o.user_id = $2
      GROUP BY o.id
    `, [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json({ order: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener orden' });
  }
});

// POST /api/payments/manual — pago por transferencia (admin aprueba manualmente)
router.post('/manual', authenticate, async (req, res) => {
  try {
    const { order_id, payment_proof } = req.body;
    await query(
      `UPDATE orders SET status = 'pending_verification', 
       metadata = jsonb_set(COALESCE(metadata,'{}'), '{proof}', $1)
       WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(payment_proof), order_id, req.user.id]
    );
    res.json({ message: 'Comprobante enviado. Tu pago será verificado en 24hs.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar pago' });
  }
});

module.exports = router;
