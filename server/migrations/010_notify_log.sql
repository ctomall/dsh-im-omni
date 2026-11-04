-- Aggregation state: one row per (tenant, conversation) holding the last time a
-- card went out and how many messages were suppressed since then.
CREATE TABLE IF NOT EXISTS notify_log (
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  last_sent_at    timestamptz NOT NULL DEFAULT now(),
  suppressed      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, conversation_id)
);

ALTER TABLE notify_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notify_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notify_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON notify_log TO im_omni_app;
