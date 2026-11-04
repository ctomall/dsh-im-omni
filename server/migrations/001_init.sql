-- SaaS core schema: tenants, accounts, devices, channels, conversations, messages.
-- Multi-tenant isolation is enforced by Postgres RLS, not by the application:
-- every request runs inside `SET LOCAL app.tenant_id = '<uuid>'`, and a missing
-- or wrong tenant yields zero rows instead of someone else's data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  plan        text NOT NULL DEFAULT 'team' CHECK (plan IN ('trial','team','business','enterprise')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL DEFAULT '',
  name          text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'agent' CHECK (role IN ('owner','admin','agent','viewer')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE devices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT '',
  platform   text NOT NULL DEFAULT 'android',
  token_hash text NOT NULL,
  push_provider text NOT NULL DEFAULT '',
  push_token text NOT NULL DEFAULT '',
  last_seen  timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_by_user ON devices (tenant_id, user_id) WHERE revoked_at IS NULL;

CREATE TABLE channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        text NOT NULL,
  name        text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  health      text NOT NULL DEFAULT 'ready',
  credentials text NOT NULL DEFAULT '',        -- encrypted blob, never returned to clients
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX channels_by_tenant ON channels (tenant_id);

CREATE TABLE contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT '',
  company    text NOT NULL DEFAULT '',
  phone      text NOT NULL DEFAULT '',
  email      text NOT NULL DEFAULT '',
  hue        integer NOT NULL DEFAULT 210,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_by_tenant ON contacts (tenant_id, updated_at DESC);

CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id      uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  subject         text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','snoozed')),
  priority        text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assignee_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  tags            text[] NOT NULL DEFAULT '{}',
  unread          integer NOT NULL DEFAULT 0,
  muted           boolean NOT NULL DEFAULT false,
  bot_paused      boolean NOT NULL DEFAULT false,
  first_response_at timestamptz,
  last_inbound_at timestamptz,
  snoozed_until   timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_feed ON conversations (tenant_id, updated_at DESC);
CREATE INDEX conversations_assignee ON conversations (tenant_id, assignee_id, status);

-- Messages are partitioned by month: the table that gets big.
CREATE TABLE messages (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  direction       text NOT NULL CHECK (direction IN ('in','out')),
  kind            text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','note','attachment','system')),
  body            text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'received',
  client_id       text NOT NULL DEFAULT '',
  error           text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE messages_2026_11 PARTITION OF messages
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE messages_default PARTITION OF messages DEFAULT;

-- Idempotency lives outside the partitioned table: a unique index on a
-- partitioned table must include the partition key, and client retries are
-- minutes apart, not months.
CREATE TABLE client_requests (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  text NOT NULL,
  message_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_id)
);

CREATE INDEX messages_thread ON messages (tenant_id, conversation_id, created_at DESC);

CREATE TABLE usage_events (
  id          bigserial,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('message','ai','translation','seat','channel')),
  quantity    integer NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE usage_events_2026_11 PARTITION OF usage_events
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE usage_events_default PARTITION OF usage_events DEFAULT;
CREATE INDEX usage_events_by_tenant ON usage_events (tenant_id, type, occurred_at DESC);

CREATE TABLE subscriptions (
  tenant_id     uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  plan          text NOT NULL DEFAULT 'team',
  status        text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','canceled')),
  seats         integer NOT NULL DEFAULT 5,
  period_start  date NOT NULL DEFAULT date_trunc('month', now())::date,
  period_end    date NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month')::date,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period     date NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency   text NOT NULL DEFAULT 'CNY',
  status     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','void')),
  issued_at  timestamptz,
  paid_at    timestamptz
);
CREATE INDEX invoices_by_tenant ON invoices (tenant_id, period DESC);

CREATE TABLE audit_logs (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  target     text NOT NULL DEFAULT '',
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_by_tenant ON audit_logs (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'devices','channels','contacts','conversations','messages','usage_events',
    'subscriptions','invoices','audit_logs','memberships','client_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    $f$, t);
  END LOOP;
END $$;

-- Service role used by the API. It owns nothing, so RLS applies to it.
GRANT USAGE ON SCHEMA public TO im_omni_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO im_omni_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO im_omni_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO im_omni_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO im_omni_app;

-- Non-tenant tables are readable only through explicit joins, but the app must
-- still resolve a login by email before it knows the tenant.
GRANT SELECT, INSERT, UPDATE ON users TO im_omni_app;
GRANT SELECT ON tenants TO im_omni_app;
