-- LC-AI BUSINESS — esquema núcleo (Fase 1). Multi-tenant con RLS.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- contexto de tenant ----------
CREATE OR REPLACE FUNCTION app_company() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.company_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT COALESCE(current_setting('app.system', true), 'off') = 'on' $$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- planes (globales, configurables desde SUPER ADMIN) ----------
CREATE TABLE plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer,                       -- NULL = sin precio definido todavía
  currency    text NOT NULL DEFAULT 'ARS',
  limits      jsonb NOT NULL DEFAULT '{}',   -- users, agents, conversations, documents, storage_mb, ai_tokens
  features    jsonb NOT NULL DEFAULT '{}',   -- integraciones habilitadas
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER plans_updated BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- empresas (tenants) ----------
CREATE TABLE companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,                       -- nombre comercial
  legal_name      text NOT NULL DEFAULT '',
  tax_id          text NOT NULL DEFAULT '',            -- CUIT
  address         text NOT NULL DEFAULT '',
  phone           text NOT NULL DEFAULT '',
  whatsapp        text NOT NULL DEFAULT '',
  email           text NOT NULL DEFAULT '',
  website         text NOT NULL DEFAULT '',
  instagram       text NOT NULL DEFAULT '',
  facebook        text NOT NULL DEFAULT '',
  business_hours  text NOT NULL DEFAULT '',
  timezone        text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  logo_url        text NOT NULL DEFAULT '',
  brand_primary   text NOT NULL DEFAULT '#39ff88',
  brand_secondary text NOT NULL DEFAULT '#8b5cf6',
  description     text NOT NULL DEFAULT '',
  services        text NOT NULL DEFAULT '',
  products_info   text NOT NULL DEFAULT '',
  faq             text NOT NULL DEFAULT '',
  policies        text NOT NULL DEFAULT '',
  commercial_info text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','suspended')),
  is_demo         boolean NOT NULL DEFAULT false,
  plan_id         uuid REFERENCES plans(id),
  public_key      text NOT NULL UNIQUE DEFAULT ('lcb_' || encode(gen_random_bytes(12), 'hex')), -- ID para el widget (Fase 3)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER companies_updated BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id            uuid NOT NULL REFERENCES plans(id),
  status             text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','canceled')),
  current_period_end timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_company_idx ON subscriptions(company_id);

-- ---------- usuarios ----------
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,   -- NULL solo para super_admin
  email           text NOT NULL,
  password_hash   text NOT NULL,
  name            text NOT NULL,
  role            text NOT NULL CHECK (role IN ('super_admin','company_admin','operator','viewer')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'super_admin') = (company_id IS NULL))
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE INDEX users_company_idx ON users(company_id);
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE refresh_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  user_agent  text NOT NULL DEFAULT '',
  ip          text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_user_idx ON refresh_sessions(user_id);
CREATE INDEX refresh_family_idx ON refresh_sessions(family_id);

-- ---------- agentes ----------
CREATE TABLE agents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  type             text NOT NULL CHECK (type IN ('attention','sales','stock','admin','appointments','whatsapp','manager','custom')),
  avatar           text NOT NULL DEFAULT '',
  personality      text NOT NULL DEFAULT '',
  tone             text NOT NULL DEFAULT 'profesional',
  language         text NOT NULL DEFAULT 'es',
  objective        text NOT NULL DEFAULT '',
  instructions     text NOT NULL DEFAULT '',
  welcome_message  text NOT NULL DEFAULT '',
  offline_message  text NOT NULL DEFAULT '',
  rules            jsonb NOT NULL DEFAULT '[]',          -- lista de strings
  schedule         jsonb NOT NULL DEFAULT '{"enabled":false}',
  data_sources     jsonb NOT NULL DEFAULT '{"knowledge":true}',
  autonomy         text NOT NULL DEFAULT 'medium' CHECK (autonomy IN ('low','medium','high')),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agents_company_idx ON agents(company_id);
CREATE TRIGGER agents_updated BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE agent_tools (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id          uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_name         text NOT NULL,
  enabled           boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT false,
  config            jsonb NOT NULL DEFAULT '{}',
  UNIQUE (agent_id, tool_name)
);
CREATE INDEX agent_tools_company_idx ON agent_tools(company_id);

-- ---------- clientes (CRM completo en Fase 2) ----------
CREATE TABLE customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name      text NOT NULL DEFAULT '',
  last_name       text NOT NULL DEFAULT '',
  company_name    text NOT NULL DEFAULT '',
  phone           text NOT NULL DEFAULT '',
  whatsapp        text NOT NULL DEFAULT '',
  email           text NOT NULL DEFAULT '',
  address         text NOT NULL DEFAULT '',
  tags            text[] NOT NULL DEFAULT '{}',
  lead_status     text NOT NULL DEFAULT 'new' CHECK (lead_status IN ('new','contacted','interested','quote','customer','lost')),
  last_contact_at timestamptz,
  last_agent_id   uuid REFERENCES agents(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_company_idx ON customers(company_id);
CREATE TRIGGER customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- conversaciones ----------
CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  channel         text NOT NULL CHECK (channel IN ('test','demo','widget','whatsapp')),
  status          text NOT NULL DEFAULT 'ai' CHECK (status IN ('ai','waiting_customer','needs_human','closed')),
  mode            text NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai','human')),   -- quién responde
  contact_name    text NOT NULL DEFAULT '',
  visitor_hash    text,                                                         -- sha256 del id anónimo del visitante
  tags            text[] NOT NULL DEFAULT '{}',
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  handoff_reason  text NOT NULL DEFAULT '',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_company_idx ON conversations(company_id, last_message_at DESC);
CREATE INDEX conversations_agent_idx ON conversations(agent_id);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('customer','ai','human','system')),
  content         text NOT NULL,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  meta            jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_idx ON messages(conversation_id, created_at);
CREATE INDEX messages_company_idx ON messages(company_id, created_at);

CREATE TABLE conversation_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_conv_idx ON conversation_notes(conversation_id);

-- ---------- conocimiento (RAG) ----------
CREATE TABLE documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES agents(id) ON DELETE CASCADE,       -- NULL = disponible para todos los agentes
  title       text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('file','text','url')),
  filename    text NOT NULL DEFAULT '',
  mime        text NOT NULL DEFAULT '',
  size_bytes  integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
  error       text NOT NULL DEFAULT '',
  chunk_count integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_company_idx ON documents(company_id);

CREATE TABLE knowledge_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal     integer NOT NULL,
  content     text NOT NULL,
  tsv         tsvector GENERATED ALWAYS AS (to_tsvector('spanish'::regconfig, content)) STORED,
  embedding   real[],                                              -- reservado: pgvector en producción
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chunks_tsv_idx ON knowledge_chunks USING gin (tsv);
CREATE INDEX chunks_doc_idx ON knowledge_chunks(document_id);
CREATE INDEX chunks_company_idx ON knowledge_chunks(company_id);

-- ---------- consumo, auditoría, configuración ----------
CREATE TABLE usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id        uuid REFERENCES agents(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  provider        text NOT NULL,
  model           text NOT NULL DEFAULT '',
  tokens_in       integer NOT NULL DEFAULT 0,
  tokens_out      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_company_idx ON usage(company_id, created_at);

CREATE TABLE audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text NOT NULL DEFAULT '',
  entity_id  text NOT NULL DEFAULT '',
  ip         text NOT NULL DEFAULT '',
  meta       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_company_idx ON audit_logs(company_id, created_at DESC);

CREATE TABLE settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,       -- NULL = configuración global
  key        text NOT NULL,
  value      jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX settings_uq ON settings (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

-- ---------- Row-Level Security ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscriptions','users','agents','agent_tools','customers','conversations','messages',
                           'conversation_notes','documents','knowledge_chunks','usage','audit_logs','settings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (company_id = app_company() OR app_is_system()) WITH CHECK (company_id = app_company() OR app_is_system())', t);
  END LOOP;
END $$;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON companies USING (id = app_company() OR app_is_system()) WITH CHECK (id = app_company() OR app_is_system());

ALTER TABLE refresh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY system_only ON refresh_sessions USING (app_is_system()) WITH CHECK (app_is_system());
