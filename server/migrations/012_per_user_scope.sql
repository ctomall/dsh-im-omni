-- Per-member visibility: each teammate owns their own channel numbers and the
-- conversations that arrive on them. Owners and admins see the whole tenant.
--
-- Two settings drive the policies: app.tenant_id (already used) and app.user_id.
-- app.user_id is empty for system work (webhooks, dispatcher, usage) and those
-- paths keep tenant-wide visibility.

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'own'
  CHECK (scope IN ('all', 'own'));

UPDATE memberships SET scope = 'all' WHERE role IN ('owner', 'admin');

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- Backfill: the tenant owner owns every existing channel, and a conversation
-- belongs to the owner of the channel it arrived on.
UPDATE channels c
   SET owner_user_id = m.user_id
  FROM memberships m
 WHERE m.tenant_id = c.tenant_id AND m.role = 'owner' AND c.owner_user_id IS NULL;

UPDATE conversations v
   SET owner_user_id = c.owner_user_id
  FROM channels c
 WHERE c.id = v.channel_id AND v.owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS channels_by_owner ON channels (tenant_id, owner_user_id);
CREATE INDEX IF NOT EXISTS conversations_by_owner ON conversations (tenant_id, owner_user_id);
CREATE INDEX IF NOT EXISTS conversations_by_contact ON conversations (tenant_id, contact_id);

-- The acting user, or NULL for internal work.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
  $$;

-- 'all' | 'own' for the acting user in the current tenant.
CREATE OR REPLACE FUNCTION app_scope() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((
      SELECT m.scope FROM memberships m
       WHERE m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
         AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    ), 'own')
  $$;

DROP POLICY IF EXISTS tenant_isolation ON channels;
CREATE POLICY user_scope ON channels
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (app_user_id() IS NULL OR app_scope() = 'all' OR owner_user_id = app_user_id())
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (app_user_id() IS NULL OR app_scope() = 'all' OR owner_user_id = app_user_id())
  );

DROP POLICY IF EXISTS tenant_isolation ON conversations;
CREATE POLICY user_scope ON conversations
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (app_user_id() IS NULL OR app_scope() = 'all' OR owner_user_id = app_user_id())
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (app_user_id() IS NULL OR app_scope() = 'all' OR owner_user_id = app_user_id())
  );

-- A contact is visible when at least one of its conversations is visible; the
-- EXISTS runs under the caller's policies, so it follows the same scope.
DROP POLICY IF EXISTS tenant_isolation ON contacts;
CREATE POLICY user_scope ON contacts
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (app_user_id() IS NULL OR app_scope() = 'all'
         OR EXISTS (SELECT 1 FROM conversations v WHERE v.tenant_id = contacts.tenant_id AND v.contact_id = contacts.id))
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

GRANT EXECUTE ON FUNCTION app_user_id() TO im_omni_app;
GRANT EXECUTE ON FUNCTION app_scope() TO im_omni_app;
