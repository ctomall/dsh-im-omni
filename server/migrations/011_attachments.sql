-- Attachment metadata; bytes live on disk under UPLOAD_DIR (object storage later).
CREATE TABLE IF NOT EXISTS attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id  uuid,
  name        text NOT NULL DEFAULT '',
  type        text NOT NULL DEFAULT 'application/octet-stream',
  size        integer NOT NULL DEFAULT 0,
  object_key  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attachments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS attachments_by_message ON attachments (tenant_id, message_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON attachments TO im_omni_app;
