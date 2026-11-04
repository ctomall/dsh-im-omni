-- Two lookups cannot run under RLS because the caller has no tenant yet:
-- listing a user's tenants (login) and consuming a refresh token. Both are
-- narrow SECURITY DEFINER functions that return only what the flow needs.

CREATE OR REPLACE FUNCTION user_tenants(p_user_id uuid)
RETURNS TABLE (tenant_id uuid, name text, slug text, role text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, t.slug, m.role
    FROM memberships m
    JOIN tenants t ON t.id = m.tenant_id
   WHERE m.user_id = p_user_id
   ORDER BY m.joined_at ASC;
$$;

CREATE OR REPLACE FUNCTION claim_refresh(p_token_hash text)
RETURNS TABLE (user_id uuid, tenant_id uuid, device_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    UPDATE refresh_tokens r
       SET revoked_at = now()
     WHERE r.token_hash = p_token_hash
       AND r.revoked_at IS NULL
       AND r.expires_at > now()
    RETURNING r.user_id, r.tenant_id, r.device_id;
END $$;

CREATE OR REPLACE FUNCTION user_by_email(p_email text)
RETURNS TABLE (id uuid, email text, password_hash text, name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.email, u.password_hash, u.name FROM users u WHERE lower(u.email) = lower(p_email);
$$;

REVOKE ALL ON FUNCTION user_tenants(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_refresh(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_tenants(uuid) TO im_omni_app;
GRANT EXECUTE ON FUNCTION claim_refresh(text) TO im_omni_app;
GRANT EXECUTE ON FUNCTION user_by_email(text) TO im_omni_app;
