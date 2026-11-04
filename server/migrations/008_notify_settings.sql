-- Per-tenant notification settings (WeCom robot webhook).
CREATE TABLE IF NOT EXISTS tenant_notify (
  tenant_id       uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled         boolean NOT NULL DEFAULT false,
  wecom_webhook   text NOT NULL DEFAULT '',
  quiet_start     text NOT NULL DEFAULT '',
  quiet_end       text NOT NULL DEFAULT '',
  private_preview boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_notify ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_notify FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_notify
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_notify TO im_omni_app;
