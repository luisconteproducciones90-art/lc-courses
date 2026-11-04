-- Canales Instagram, Facebook Messenger y Email.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check CHECK (channel IN ('test','demo','widget','whatsapp','instagram','facebook','email'));
CREATE INDEX customers_extref_idx ON customers (company_id, external_ref) WHERE external_ref <> '';
