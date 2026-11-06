-- Visibility is a permission an owner grants per member, not a role constant.
-- permissions jsonb keys today:
--   dataScope : 'own' (default) | 'all'
--   channelIds: uuid[] of extra channel numbers this member may see
-- Role still supplies the default when no permission is stored.

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Extra channel numbers granted to the acting member.
CREATE OR REPLACE FUNCTION app_channel_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((
      SELECT ARRAY(
        SELECT value::uuid
          FROM jsonb_array_elements_text(
                 COALESCE((SELECT m.permissions -> 'channelIds'
                             FROM memberships m
                            WHERE m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                              AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid), '[]'::jsonb)
               ) AS value
      )
    ), ARRAY[]::uuid[])
  $$;

-- Scope: an explicit permission wins; otherwise the role decides.
CREATE OR REPLACE FUNCTION app_scope() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((
      SELECT COALESCE(m.permissions ->> 'dataScope',
                      CASE WHEN m.role IN ('owner', 'admin') THEN 'all' ELSE 'own' END)
        FROM memberships m
       WHERE m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
         AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    ), 'own')
  $$;

DROP POLICY IF EXISTS user_scope ON channels;
CREATE POLICY user_scope ON channels
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (app_user_id() IS NULL OR app_scope() = 'all'
         OR owner_user_id = app_user_id() OR id = ANY(app_channel_ids()))
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (app_user_id() IS NULL OR app_scope() = 'all'
         OR owner_user_id = app_user_id() OR id = ANY(app_channel_ids()))
  );

DROP POLICY IF EXISTS user_scope ON conversations;
CREATE POLICY user_scope ON conversations
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (app_user_id() IS NULL OR app_scope() = 'all'
         OR owner_user_id = app_user_id() OR channel_id = ANY(app_channel_ids()))
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (app_user_id() IS NULL OR app_scope() = 'all'
         OR owner_user_id = app_user_id() OR channel_id = ANY(app_channel_ids()))
  );

-- Contacts follow any conversation the member may see (already scoped above,
-- so the EXISTS inherits the channel grants automatically).

GRANT EXECUTE ON FUNCTION app_channel_ids() TO im_omni_app;
