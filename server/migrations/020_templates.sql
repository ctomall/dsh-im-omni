-- Shared reply templates. Team-wide by design: one set of answers every agent can
-- use; only the author (or an owner/admin) may change a row.
CREATE TABLE IF NOT EXISTS templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  shortcut     text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS templates_by_tenant ON templates (tenant_id, name);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON templates;
CREATE POLICY tenant_isolation ON templates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON templates TO im_omni_app;
