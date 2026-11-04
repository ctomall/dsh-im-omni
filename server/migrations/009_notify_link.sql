-- Deep link template for notification cards, e.g. dshomni://chat/{conversationId}
ALTER TABLE tenant_notify ADD COLUMN IF NOT EXISTS link_template text NOT NULL DEFAULT '';
