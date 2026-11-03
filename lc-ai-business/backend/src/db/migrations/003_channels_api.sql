-- Fase 3: widget web, WhatsApp, integraciones, API keys, webhooks.
ALTER TABLE companies ADD COLUMN widget jsonb NOT NULL DEFAULT '{"enabled":true,"position":"right","allowed_origins":[]}';
ALTER TABLE messages ADD COLUMN external_id text;
CREATE UNIQUE INDEX messages_external_uq ON messages (company_id, external_id) WHERE external_id IS NOT NULL;
ALTER TABLE conversations ADD COLUMN external_contact text NOT NULL DEFAULT '';
CREATE INDEX conversations_contact_idx ON conversations (company_id, channel, external_contact) WHERE external_contact <> '';

CREATE TABLE integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL,                      -- 'whatsapp' | 'rest:<nombre>'
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled','active','error')),
  config jsonb NOT NULL DEFAULT '{}',          -- datos NO secretos
  secrets text NOT NULL DEFAULT '',            -- JSON cifrado (AES-256-GCM)
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider)
);
CREATE TRIGGER integrations_updated BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_company_idx ON api_keys(company_id);

CREATE TABLE whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'es',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name, language)
);

CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret_enc text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_endpoints_company_idx ON webhook_endpoints(company_id);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status_code integer,
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_events_idx ON webhook_events(company_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['integrations','api_keys','whatsapp_templates','webhook_endpoints','webhook_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (company_id = app_company() OR app_is_system()) WITH CHECK (company_id = app_company() OR app_is_system())', t);
  END LOOP;
END $$;
