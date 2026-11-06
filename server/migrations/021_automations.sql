-- Automation rules. Stored and shared by the team, but NOT executed yet: the panel
-- is explicit about that, and nothing here touches a channel.
CREATE TABLE IF NOT EXISTS automations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  trigger       text NOT NULL DEFAULT 'message',
  keyword       text NOT NULL DEFAULT '',
  channel_id    uuid REFERENCES channels(id) ON DELETE SET NULL,
  contact_tag   text NOT NULL DEFAULT '',
  priority      text NOT NULL DEFAULT 'normal',
  actions       jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automations_by_tenant ON automations (tenant_id, name);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON automations;
CREATE POLICY tenant_isolation ON automations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON automations TO im_omni_app;
