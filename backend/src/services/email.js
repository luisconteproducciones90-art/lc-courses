const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function baseTemplate(content) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      body { margin:0; background:#020818; font-family:'Segoe UI',sans-serif; color:#e8f4ff; }
      .wrap { max-width:600px; margin:0 auto; padding:40px 20px; }
      .logo { font-size:28px; font-weight:900; color:#00d4ff; letter-spacing:.1em; margin-bottom:30px; }
      .logo span { color:#bf00ff; }
      .box { background:#050f2a; border:1px solid rgba(0,212,255,.15); padding:32px; }
      h2 { color:#00fff7; margin-top:0; }
      p { color:#6a8aaa; line-height:1.7; }
      .btn { display:inline-block; background:linear-gradient(135deg,#00d4ff,#bf00ff);
             color:#fff; padding:12px 28px; text-decoration:none; font-weight:700;
             font-size:14px; letter-spacing:.08em; margin-top:20px; }
      .divider { height:1px; background:linear-gradient(90deg,transparent,#00d4ff,transparent); margin:24px 0; }
      .footer { text-align:center; color:#3a5070; font-size:12px; margin-top:30px; }
      .highlight { color:#00d4ff; font-weight:600; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="logo">LC-<span>COURSES</span></div>
      <div class="box">${content}</div>
      <div class="footer">
        © 2026 LC-COURSES · Buenos Aires, Argentina<br>
        📧 lccourses2026@gmail.com · 💬 +54 11 2762-0794
      </div>
    </div>
  </body>
  </html>`;
}

async function sendPurchaseConfirmation({ to, name, courses, orderId }) {
  const courseList = courses.map(c => `<li style="color:#00fff7;margin:6px 0">✓ ${c}</li>`).join('');
  const html = baseTemplate(`
    <h2>🎉 ¡Compra confirmada!</h2>
    <p>Hola <span class="highlight">${name}</span>, tu pago fue procesado exitosamente.</p>
    <div class="divider"></div>
    <p><strong style="color:#e8f4ff">Cursos adquiridos:</strong></p>
    <ul style="padding-left:20px">${courseList}</ul>
    <p>Ya tenés acceso inmediato desde tu panel de alumno. Recordá que el acceso es <span class="highlight">de por vida</span> y las actualizaciones son gratuitas.</p>
    <a href="${process.env.FRONTEND_URL}/dashboard" class="btn">Ir a mis cursos →</a>
    <div class="divider"></div>
    <p style="font-size:13px">N° de orden: <code style="color:#00d4ff">${orderId}</code></p>
  `);
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: '✅ LC-COURSES — Compra confirmada',
    html,
  });
}

async function sendWelcomeEmail({ to, name }) {
  const html = baseTemplate(`
    <h2>¡Bienvenido a LC-COURSES! 🚀</h2>
    <p>Hola <span class="highlight">${name}</span>, tu cuenta fue creada exitosamente.</p>
    <p>Ahora podés explorar más de <strong style="color:#e8f4ff">30 cursos</strong> de tecnología, diseño, marketing, IA y más — todos con <span class="highlight">certificación oficial</span>.</p>
    <a href="${process.env.FRONTEND_URL}/cursos" class="btn">Explorar cursos →</a>
  `);
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: '🚀 Bienvenido a LC-COURSES',
    html,
  });
}

async function sendCertificateEmail({ to, name, courseName, certNumber, downloadUrl }) {
  const html = baseTemplate(`
    <h2>🏆 ¡Certificado disponible!</h2>
    <p>¡Felicitaciones <span class="highlight">${name}</span>! Completaste el curso:</p>
    <p style="font-size:20px;color:#00fff7;font-weight:700">${courseName}</p>
    <p>Tu certificado oficial está listo para descargar.</p>
    <p style="font-size:13px">N° de certificado: <code style="color:#00d4ff">${certNumber}</code></p>
    <a href="${downloadUrl}" class="btn">⬇️ Descargar certificado PDF</a>
  `);
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `🏆 Certificado: ${courseName} — LC-COURSES`,
    html,
  });
}

async function sendMassEmail({ recipients, subject, body }) {
  // Envío en lotes de 50 para no sobrecargar el servidor SMTP
  const batchSize = 50;
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      bcc: batch,
      subject,
      html: baseTemplate(`<h2>${subject}</h2>${body}`),
    });
    await new Promise(r => setTimeout(r, 1000)); // pausa entre lotes
  }
}

async function sendPasswordReset({ to, name, resetUrl }) {
  const html = baseTemplate(`
    <h2>Restablecer contraseña</h2>
    <p>Hola <span class="highlight">${name}</span>, recibimos una solicitud para restablecer tu contraseña.</p>
    <p>El enlace expira en <strong style="color:#e8f4ff">1 hora</strong>.</p>
    <a href="${resetUrl}" class="btn">Restablecer contraseña</a>
    <div class="divider"></div>
    <p style="font-size:12px">Si no solicitaste esto, ignorá este email.</p>
  `);
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: '🔑 LC-COURSES — Restablecer contraseña',
    html,
  });
}

module.exports = {
  sendPurchaseConfirmation,
  sendWelcomeEmail,
  sendCertificateEmail,
  sendMassEmail,
  sendPasswordReset,
};
