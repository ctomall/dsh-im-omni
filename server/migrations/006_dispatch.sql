-- Delivery bookkeeping for outbound messages: attempts and backoff.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS messages_pending
  ON messages (tenant_id, status)
  WHERE status = 'queued';
