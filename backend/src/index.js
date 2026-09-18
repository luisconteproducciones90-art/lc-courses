require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./config/database');
const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/courses');
const enrollmentRoutes = require('./routes/enrollments');
const paymentRoutes = require('./routes/payments');
const certificateRoutes = require('./routes/certificates');
const uploadRoutes = require('./routes/uploads');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 4000;

// ── SECURITY ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    /\.vercel\.app$/,
  ],
  credentials: true,
}));

// ── WEBHOOKS (raw body BEFORE json parser) ───────────────────
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// ── BODY PARSING ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── LOGGING ──────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// ── RATE LIMITING ────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Demasiadas solicitudes. Intenta en unos minutos.' },
});
app.use('/api/', limiter);

// Auth endpoints: stricter limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de autenticación.' },
});
app.use('/api/auth/', authLimiter);

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'LC-COURSES API',
  timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV,
}));

// ── ROUTES ───────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/courses',      courseRoutes);
app.use('/api/enrollments',  enrollmentRoutes);
app.use('/api/payments',     paymentRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/uploads',      uploadRoutes);
app.use('/api/admin',        adminRoutes);

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Endpoint no encontrado' }));

// ── ERROR HANDLER ────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message,
  });
});

// ── START ─────────────────────────────────────────────────────
async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`\n🚀 LC-COURSES API corriendo en puerto ${PORT}`);
      console.log(`   ENV: ${process.env.NODE_ENV}`);
      console.log(`   DB: conectada\n`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar:', err);
    process.exit(1);
  }
}

start();
module.exports = app;
