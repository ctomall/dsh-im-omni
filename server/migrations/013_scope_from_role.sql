-- The visible scope follows the permission the member actually holds: owners and
-- admins see the tenant, agents and viewers see their own channels and data.
-- Deriving it from the role (rather than a second column) means a role change
-- takes effect on the next request with no cache to invalidate.

CREATE OR REPLACE FUNCTION app_scope() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((
      SELECT CASE WHEN m.role IN ('owner', 'admin') THEN 'all' ELSE 'own' END
        FROM memberships m
       WHERE m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
         AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    ), 'own')
  $$;

ALTER TABLE memberships DROP COLUMN IF EXISTS scope;
