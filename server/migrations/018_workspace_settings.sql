-- Tenant-level defaults that the shared team edits: reception rules and the
-- notification robot. One row per tenant; missing row means "all defaults".
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id          uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  default_sla_minutes integer NOT NULL DEFAULT 30 CHECK (default_sla_minutes BETWEEN 1 AND 1440),
  auto_assign        boolean NOT NULL DEFAULT true,
  auto_translate     boolean NOT NULL DEFAULT true,
  translation_target text NOT NULL DEFAULT 'zh-CN',
  ai_suggestions     boolean NOT NULL DEFAULT true,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_settings;
CREATE POLICY tenant_isolation ON tenant_settings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_settings TO im_omni_app;
