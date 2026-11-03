-- Fase 4: suscripciones, facturas, marketplace de agentes.
ALTER TABLE subscriptions ADD COLUMN provider text NOT NULL DEFAULT 'manual';
ALTER TABLE subscriptions ADD COLUMN provider_ref text NOT NULL DEFAULT '';
CREATE INDEX subscriptions_ref_idx ON subscriptions(provider, provider_ref) WHERE provider_ref <> '';

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES plans(id),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ARS',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','void')),
  provider text NOT NULL DEFAULT 'manual',
  provider_ref text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_company_idx ON invoices(company_id, created_at DESC);
CREATE UNIQUE INDEX invoices_provider_uq ON invoices(provider, provider_ref) WHERE provider_ref <> '';

-- Plantillas globales publicadas por LC-SYSTEM (sin company_id: no son datos de un tenant)
CREATE TABLE agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  industry text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '🤖',
  config jsonb NOT NULL DEFAULT '{}',        -- {agent:{...}, tools:[], approvals:[], knowledge:[{title,content}]}
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  installs integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER agent_templates_updated BEFORE UPDATE ON agent_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE agent_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_installs_company_idx ON agent_installs(company_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','agent_installs']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (company_id = app_company() OR app_is_system()) WITH CHECK (company_id = app_company() OR app_is_system())', t);
  END LOOP;
END $$;
