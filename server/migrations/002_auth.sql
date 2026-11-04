-- Accounts, sessions, invites and device linking.
-- The two claim functions are SECURITY DEFINER on purpose: a code must be
-- resolvable before the caller has a tenant context, and the function is the
-- only code path that can perform that lookup.

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id   uuid REFERENCES devices(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_by_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

CREATE TABLE invite_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'agent' CHECK (role IN ('admin','agent','viewer')),
  code_hash   text NOT NULL UNIQUE,
  invited_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE device_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON refresh_tokens
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invite_codes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- device_codes stays without RLS: it holds only hashes, and the claim function
-- is the only reader.
GRANT INSERT, SELECT, UPDATE ON device_codes TO im_omni_app;
GRANT INSERT ON tenants TO im_omni_app;
GRANT SELECT, INSERT ON refresh_tokens, invite_codes TO im_omni_app;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO im_omni_app;

CREATE OR REPLACE FUNCTION claim_device_code(p_code_hash text)
RETURNS TABLE (tenant_id uuid, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    UPDATE device_codes d
       SET used_at = now()
     WHERE d.code_hash = p_code_hash
       AND d.used_at IS NULL
       AND d.expires_at > now()
    RETURNING d.tenant_id, d.user_id;
END $$;

CREATE OR REPLACE FUNCTION claim_invite(p_code_hash text)
RETURNS TABLE (tenant_id uuid, email text, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    UPDATE invite_codes i
       SET accepted_at = now()
     WHERE i.code_hash = p_code_hash
       AND i.accepted_at IS NULL
       AND i.expires_at > now()
    RETURNING i.tenant_id, i.email, i.role;
END $$;

REVOKE ALL ON FUNCTION claim_device_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_device_code(text) TO im_omni_app;
GRANT EXECUTE ON FUNCTION claim_invite(text) TO im_omni_app;
