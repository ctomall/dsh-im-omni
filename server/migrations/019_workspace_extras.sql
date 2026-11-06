-- Settings the panel exposes beyond SLA/translation: timezone, the bot identity and
-- business hours. Kept as jsonb so the bot's shape can grow without migrations.
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  ADD COLUMN IF NOT EXISTS bot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS business_hours jsonb NOT NULL DEFAULT '{}'::jsonb;
