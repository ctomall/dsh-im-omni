-- Inbound webhooks arrive before any tenant context exists: the URL carries only
-- the channel id. This narrow function resolves the channel to its tenant.
CREATE OR REPLACE FUNCTION channel_lookup(p_channel uuid)
RETURNS TABLE (tenant_id uuid, type text, credentials text, config jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT c.tenant_id, c.type, c.credentials, c.config
    FROM channels c
   WHERE c.id = p_channel;
$$;

REVOKE ALL ON FUNCTION channel_lookup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION channel_lookup(uuid) TO im_omni_app;
