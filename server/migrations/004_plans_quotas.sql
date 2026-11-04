-- Plan catalogue and per-tenant metering helpers.
-- `usage_events` already exists from 001; this adds what a plan needs and the
-- functions the API calls before a metered write.

CREATE TABLE plans (
  code             text PRIMARY KEY,
  name             text NOT NULL,
  seats            integer NOT NULL,
  channels         integer NOT NULL,
  monthly_messages integer NOT NULL,
  monthly_ai       integer NOT NULL,
  price_cents      integer NOT NULL DEFAULT 0,
  currency         text NOT NULL DEFAULT 'CNY'
);

INSERT INTO plans (code, name, seats, channels, monthly_messages, monthly_ai, price_cents) VALUES
  ('trial',      '试用',   5,    2,   2000,    100,      0),
  ('team',       '团队版', 5,    2,   10000,   500,  29900),
  ('business',   '商务版', 20,   10,  100000,  5000, 129900),
  ('enterprise', '企业版', 1000, 1000, 10000000, 1000000, 0)
ON CONFLICT (code) DO NOTHING;

GRANT SELECT ON plans TO im_omni_app;

-- Current-period usage for one tenant. RLS applies because the caller runs with
-- a tenant context; the function is a convenience, not a bypass.
CREATE OR REPLACE FUNCTION tenant_period_usage(p_tenant uuid, p_period date)
RETURNS TABLE (messages bigint, ai bigint, seats bigint, channels bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT COALESCE(SUM(quantity), 0) FROM usage_events
      WHERE tenant_id = p_tenant AND type = 'message'
        AND occurred_at >= date_trunc('month', p_period)
        AND occurred_at < date_trunc('month', p_period) + interval '1 month'),
    (SELECT COALESCE(SUM(quantity), 0) FROM usage_events
      WHERE tenant_id = p_tenant AND type = 'ai'
        AND occurred_at >= date_trunc('month', p_period)
        AND occurred_at < date_trunc('month', p_period) + interval '1 month'),
    (SELECT COUNT(*) FROM memberships WHERE tenant_id = p_tenant),
    (SELECT COUNT(*) FROM channels WHERE tenant_id = p_tenant);
$$;

GRANT EXECUTE ON FUNCTION tenant_period_usage(uuid, date) TO im_omni_app;
