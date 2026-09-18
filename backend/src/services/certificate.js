const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { getUploadPresignedUrl, getStreamingUrl } = require('./r2');
const https = require('https');
const http = require('http');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Generar número único de certificado: LC-2026-00001
 */
async function generateCertNumber() {
  const { rows } = await query('SELECT COUNT(*) FROM certificates');
  const num = parseInt(rows[0].count) + 1;
  const year = new Date().getFullYear();
  return `LC-${year}-${String(num).padStart(5, '0')}`;
}

/**
 * Generar y guardar certificado en PDF
 */
async function generateCertificate({ userId, courseId }) {
  // Verificar si ya existe
  const existing = await query(
    'SELECT * FROM certificates WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );
  if (existing.rows.length) return existing.rows[0];

  // Verificar que completó el 100%
  const { rows: progress } = await query(`
    SELECT 
      COUNT(l.id) AS total_lessons,
      COUNT(lp.id) FILTER (WHERE lp.is_completed) AS completed
    FROM lessons l
    LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1 AND lp.is_completed = TRUE
    WHERE l.course_id = $2
  `, [userId, courseId]);

  const { total_lessons, completed } = progress[0];
  if (parseInt(total_lessons) > 0 && parseInt(completed) < parseInt(total_lessons)) {
    throw new Error(`Curso no completado: ${completed}/${total_lessons} lecciones`);
  }

  // Obtener datos
  const { rows: users } = await query('SELECT name, email FROM users WHERE id = $1', [userId]);
  const { rows: courses } = await query('SELECT title, duration_hours FROM courses WHERE id = $1', [courseId]);
  if (!users.length || !courses.length) throw new Error('Usuario o curso no encontrado');

  const user = users[0];
  const course = courses[0];
  const certNumber = await generateCertNumber();
  const issueDate = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Generar QR
  const verifyUrl = `${process.env.FRONTEND_URL}/verificar/${certNumber}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 150, margin: 2 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  // Generar PDF
  const pdfBuffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const buffers = [];
    doc.on('data', b => buffers.push(b));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;

    // Fondo oscuro
    doc.rect(0, 0, W, H).fill('#020818');

    // Bordes neón
    doc.rect(20, 20, W - 40, H - 40)
       .lineWidth(3).strokeColor('#00d4ff').stroke();
    doc.rect(25, 25, W - 50, H - 50)
       .lineWidth(1).strokeColor('#bf00ff').stroke();

    // Encabezado
    doc.font('Helvetica-Bold').fontSize(36).fillColor('#00d4ff')
       .text('LC-COURSES', 0, 55, { align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor('#6a8aaa')
       .text('PLATAFORMA DE CAPACITACIÓN PROFESIONAL ONLINE', 0, 98, { align: 'center' });

    // Línea separadora
    doc.moveTo(80, 120).lineTo(W - 80, 120)
       .lineWidth(1).strokeColor('#0e2040').stroke();

    // Cuerpo
    doc.font('Helvetica').fontSize(13).fillColor('#6a8aaa')
       .text('CERTIFICA QUE', 0, 140, { align: 'center' });

    doc.font('Helvetica-Bold').fontSize(30).fillColor('#ffffff')
       .text(user.name, 0, 168, { align: 'center' });

    doc.font('Helvetica').fontSize(13).fillColor('#6a8aaa')
       .text('ha completado exitosamente el curso de', 0, 212, { align: 'center' });

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#00fff7')
       .text(course.title, 60, 238, { align: 'center', width: W - 120 });

    doc.font('Helvetica').fontSize(11).fillColor('#6a8aaa')
       .text(`Duración: ${course.duration_hours} horas  ·  Fecha: ${issueDate}`, 0, 278, { align: 'center' });

    // Línea inferior
    doc.moveTo(80, H - 100).lineTo(W - 80, H - 100)
       .lineWidth(1).strokeColor('#0e2040').stroke();

    // QR
    doc.image(qrBuffer, W - 160, H - 150, { width: 100, height: 100 });

    // Número de certificado
    doc.font('Courier').fontSize(9).fillColor('#6a8aaa')
       .text(`Certificado N°: ${certNumber}`, 60, H - 85)
       .text(`Verificar en: ${verifyUrl}`, 60, H - 70)
       .text('© LC-COURSES 2026 · Buenos Aires, Argentina', 60, H - 55);

    doc.end();
  });

  // Subir PDF a R2
  const pdfKey = `certificates/${certNumber}.pdf`;
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: pdfKey,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
  }));

  // Subir QR a R2
  const qrKey = `certificates/qr-${certNumber}.png`;
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: qrKey,
    Body: qrBuffer,
    ContentType: 'image/png',
  }));

  // Guardar en BD
  const { rows } = await query(`
    INSERT INTO certificates (user_id, course_id, cert_number, pdf_url, qr_code_url)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [userId, courseId, certNumber, pdfKey, qrKey]);

  return rows[0];
}

module.exports = { generateCertificate };
