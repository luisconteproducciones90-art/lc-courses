-- ════════════════════════════════════════════════════════
-- LC-COURSES — Esquema completo de base de datos
-- PostgreSQL 15+
-- Ejecutar: psql $DATABASE_URL -f schema.sql
-- ════════════════════════════════════════════════════════

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- búsqueda fuzzy

-- ── USERS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100)  NOT NULL,
  email        VARCHAR(255)  NOT NULL UNIQUE,
  password     VARCHAR(255),                      -- NULL si usa Google
  google_id    VARCHAR(100)  UNIQUE,
  avatar_url   TEXT,
  role         VARCHAR(20)   NOT NULL DEFAULT 'student',  -- student | admin
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  reset_token  VARCHAR(255),
  reset_expires TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);

-- ── CATEGORIES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL       PRIMARY KEY,
  slug        VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  icon        VARCHAR(10),
  sort_order  INT          DEFAULT 0
);

INSERT INTO categories (slug, name, icon, sort_order) VALUES
  ('tech',      'Tecnología y Reparación', '🔧', 1),
  ('design',    'Diseño y Edición',         '🎨', 2),
  ('ai',        'Inteligencia Artificial',  '🤖', 3),
  ('marketing', 'Marketing y Ventas',       '📢', 4),
  ('edu',       'Educación Profesional',    '📚', 5),
  ('biz',       'Negocios e Inversiones',   '💰', 6),
  ('trade',     'Oficios',                  '🛠', 7)
ON CONFLICT DO NOTHING;

-- ── COURSES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id      INT         REFERENCES categories(id) ON DELETE SET NULL,
  title            VARCHAR(200) NOT NULL,
  slug             VARCHAR(200) NOT NULL UNIQUE,
  description      TEXT,
  short_desc       VARCHAR(300),
  icon             VARCHAR(10),
  thumbnail_url    TEXT,
  intro_video_url  TEXT,
  level            VARCHAR(20) NOT NULL DEFAULT 'Principiante', -- Principiante|Intermedio|Avanzado
  duration_hours   DECIMAL(5,1),
  price            INT         NOT NULL,   -- en ARS centavos (ej: 12900 = $129.00)
  original_price   INT,
  is_published     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_featured      BOOLEAN     NOT NULL DEFAULT FALSE,
  has_certificate  BOOLEAN     NOT NULL DEFAULT TRUE,
  lifetime_access  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_courses_category ON courses(category_id);
CREATE INDEX idx_courses_published ON courses(is_published);
CREATE INDEX idx_courses_title_trgm ON courses USING gin(title gin_trgm_ops);

-- ── COURSE MODULES & LESSONS ───────────────────────────────
CREATE TABLE IF NOT EXISTS course_modules (
  id          SERIAL      PRIMARY KEY,
  course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  sort_order  INT         DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
  id            SERIAL      PRIMARY KEY,
  module_id     INT         NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  course_id     UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  video_key     TEXT,        -- key en Cloudflare R2
  video_url     TEXT,        -- URL pública o firmada
  duration_secs INT,
  sort_order    INT         DEFAULT 0,
  is_preview    BOOLEAN     NOT NULL DEFAULT FALSE  -- lección gratuita de muestra
);
CREATE INDEX idx_lessons_course ON lessons(course_id);

-- ── COURSE SYLLABUS (temario textual) ──────────────────────
CREATE TABLE IF NOT EXISTS course_syllabus (
  id         SERIAL  PRIMARY KEY,
  course_id  UUID    NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item       TEXT    NOT NULL,
  sort_order INT     DEFAULT 0
);

-- ── ENROLLMENTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id     UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',  -- active|suspended|refunded
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,  -- NULL = acceso de por vida
  UNIQUE(user_id, course_id)
);
CREATE INDEX idx_enrollments_user   ON enrollments(user_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);

-- ── LESSON PROGRESS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_progress (
  id             SERIAL      PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id      INT         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id      UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  is_completed   BOOLEAN     NOT NULL DEFAULT FALSE,
  watch_seconds  INT         DEFAULT 0,
  completed_at   TIMESTAMPTZ,
  UNIQUE(user_id, lesson_id)
);

-- ── ORDERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        NOT NULL REFERENCES users(id),
  status              VARCHAR(30) NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected | cancelled | refunded
  subtotal            INT         NOT NULL,  -- ARS
  discount_amount     INT         NOT NULL DEFAULT 0,
  total               INT         NOT NULL,
  coupon_code         VARCHAR(50),
  payment_method      VARCHAR(50),
  mp_preference_id    TEXT,
  mp_payment_id       TEXT,
  mp_status           TEXT,
  mp_status_detail    TEXT,
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_user   ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_mp     ON orders(mp_payment_id);

CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL  PRIMARY KEY,
  order_id   UUID    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  course_id  UUID    NOT NULL REFERENCES courses(id),
  title      TEXT    NOT NULL,
  price      INT     NOT NULL
);

-- ── COUPONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id              SERIAL      PRIMARY KEY,
  code            VARCHAR(50) NOT NULL UNIQUE,
  discount_pct    INT         NOT NULL,  -- porcentaje 1-100
  max_uses        INT,                   -- NULL = ilimitado
  used_count      INT         NOT NULL DEFAULT 0,
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until     TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO coupons (code, discount_pct, max_uses) VALUES
  ('BIENVENIDO20', 20, 100),
  ('LCCOURSES10',  10, NULL)
ON CONFLICT DO NOTHING;

-- ── CERTIFICATES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES users(id),
  course_id       UUID        NOT NULL REFERENCES courses(id),
  cert_number     VARCHAR(30) NOT NULL UNIQUE,  -- LC-2026-00001
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pdf_url         TEXT,
  qr_code_url     TEXT,
  UNIQUE(user_id, course_id)
);
CREATE INDEX idx_certs_number ON certificates(cert_number);

-- ── DOWNLOADABLE MATERIALS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS course_materials (
  id          SERIAL      PRIMARY KEY,
  course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  file_key    TEXT        NOT NULL,  -- key en R2
  file_type   VARCHAR(20),           -- pdf|zip|xlsx...
  file_size   BIGINT
);

-- ── UPDATED_AT TRIGGER ─────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_courses_updated  BEFORE UPDATE ON courses  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_orders_updated   BEFORE UPDATE ON orders   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
