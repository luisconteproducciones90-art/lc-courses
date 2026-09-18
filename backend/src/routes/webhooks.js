const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { Payment } = require('mercadopago');
const { MercadoPagoConfig } = require('mercadopago');
const { query, transaction } = require('../config/database');
const emailService = require('../services/email');
const certificateService = require('../services/certificate');

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// Verifica que la notificación realmente venga de Mercado Pago.
// Sin esto, cualquiera puede simular un pago "approved" con un POST
// directo y obtener acceso gratis a cursos pagos.
// https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/your-integrations/notifications/webhooks#editor_5
function verifyMpSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  if (!xSignature || !xRequestId) return false;

  const parts = Object.fromEntries(
    xSignature.split(',').map(p => p.trim().split('=').map(s => s.trim()))
  );
  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  const dataId = req.query['data.id'] || '';
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

// POST /api/webhooks/mercadopago
router.post('/mercadopago', async (req, res) => {
  try {
    if (!verifyMpSignature(req)) {
      console.warn('[WEBHOOK/mp] Firma inválida o ausente — notificación rechazada');
      return res.sendStatus(401);
    }

    // Responder 200 rápido para que MP no reintente
    res.sendStatus(200);

    const body = JSON.parse(req.body.toString());
    const { type, data } = body;

    if (type !== 'payment') return;

    const paymentId = data?.id;
    if (!paymentId) return;

    // Obtener datos del pago desde MP
    const paymentClient = new Payment(mpClient);
    const mpPayment = await paymentClient.get({ id: paymentId });

    const orderId = mpPayment.external_reference;
    const mpStatus = mpPayment.status;          // approved|rejected|pending|...
    const mpDetail = mpPayment.status_detail;

    if (!orderId) return;

    // Actualizar orden
    await query(`
      UPDATE orders
      SET mp_payment_id = $1, mp_status = $2, mp_status_detail = $3,
          status = CASE
            WHEN $2 = 'approved' THEN 'approved'
            WHEN $2 IN ('rejected','cancelled') THEN 'rejected'
            ELSE 'pending'
          END
      WHERE id = $4
    `, [String(paymentId), mpStatus, mpDetail, orderId]);

    if (mpStatus !== 'approved') return;

    // Inscribir al alumno en los cursos comprados
    const { rows: items } = await query(
      'SELECT oi.course_id, o.user_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.order_id = $1',
      [orderId]
    );

    for (const item of items) {
      // Crear enrollment (ON CONFLICT para idempotencia)
      await query(`
        INSERT INTO enrollments (user_id, course_id, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active'
      `, [item.user_id, item.course_id]);
    }

    // Enviar email de confirmación
    const { rows: users } = await query('SELECT name, email FROM users WHERE id = $1', [items[0].user_id]);
    const { rows: courses } = await query(
      `SELECT title FROM courses WHERE id = ANY($1)`,
      [items.map(i => i.course_id)]
    );

    if (users.length) {
      await emailService.sendPurchaseConfirmation({
        to: users[0].email,
        name: users[0].name,
        courses: courses.map(c => c.title),
        orderId,
      });
    }

    console.log(`✅ Pago aprobado: orden ${orderId} — usuario ${items[0]?.user_id}`);
  } catch (err) {
    console.error('[WEBHOOK/mp]', err);
  }
});

module.exports = router;
