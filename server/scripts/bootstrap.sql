-- Superuser bootstrap. Run once per database host, BEFORE `npm run migrate`:
--   sudo -u postgres psql -f scripts/bootstrap.sql
--
-- Two roles on purpose:
--   im_omni_owner owns the schema and the SECURITY DEFINER functions. It has
--   BYPASSRLS so the narrow cross-tenant lookups (login, refresh, invites,
--   device codes) can resolve a row before a tenant context exists.
--   im_omni_app is what the API connects as: no BYPASSRLS, so RLS always applies.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'im_omni_owner') THEN
    CREATE ROLE im_omni_owner LOGIN PASSWORD 'owner_dev_pw';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'im_omni_app') THEN
    CREATE ROLE im_omni_app LOGIN PASSWORD 'app_dev_pw' NOBYPASSRLS;
  END IF;
END $$;

ALTER ROLE im_omni_owner BYPASSRLS;
-- The restore drill creates and drops a scratch database.
ALTER ROLE im_omni_owner CREATEDB;
ALTER ROLE im_omni_app NOBYPASSRLS;

SELECT 'create the database and migrations next' AS next_step;
