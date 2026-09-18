const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { generateCertificate } = require('../services/certificate');
const { getStreamingUrl } = require('../services/r2');
const { query } = require('../config/database');

// GET /api/certificates — mis certificados
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT cert.*, c.title AS course_title, c.icon AS course_icon
      FROM certificates cert
      JOIN courses c ON c.id = cert.course_id
      WHERE cert.user_id = $1
      ORDER BY cert.issued_at DESC
    `, [req.user.id]);
    res.json({ certificates: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener certificados' });
  }
});

// POST /api/certificates/generate — generar certificado al completar curso
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: 'course_id requerido' });

    const cert = await generateCertificate({ userId: req.user.id, courseId: course_id });
    res.json({ certificate: cert });
  } catch (err) {
    if (err.message.includes('no completado')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[CERT/generate]', err);
    res.status(500).json({ error: 'Error al generar certificado' });
  }
});

// GET /api/certificates/:number/download — URL firmada para descargar PDF
router.get('/:number/download', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM certificates WHERE cert_number = $1 AND user_id = $2',
      [req.params.number, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Certificado no encontrado' });

    const downloadUrl = await getStreamingUrl(rows[0].pdf_url);
    res.json({ download_url: downloadUrl });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener certificado' });
  }
});

// GET /api/certificates/verify/:number — verificación pública (sin auth)
router.get('/verify/:number', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT cert.cert_number, cert.issued_at,
             u.name AS student_name,
             c.title AS course_title, c.duration_hours
      FROM certificates cert
      JOIN users u ON u.id = cert.user_id
      JOIN courses c ON c.id = cert.course_id
      WHERE cert.cert_number = $1
    `, [req.params.number]);

    if (!rows.length) return res.status(404).json({ valid: false, error: 'Certificado no encontrado' });
    res.json({ valid: true, certificate: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al verificar certificado' });
  }
});

module.exports = router;
