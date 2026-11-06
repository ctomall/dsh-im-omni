-- The reminder sweep runs without a tenant context, so it reads through a
-- SECURITY DEFINER function instead of opening a privileged pool.
CREATE OR REPLACE FUNCTION pending_approvals_due(p_cutoff timestamptz)
RETURNS TABLE (
  id uuid, tenant_id uuid, action text, target_user uuid,
  requester_name text, requester_email text, target_name text, target_email text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.tenant_id, a.action, a.target_user,
         r.name, r.email, t.name, t.email
    FROM approval_requests a
    LEFT JOIN users r ON r.id = a.requested_by
    LEFT JOIN users t ON t.id = a.target_user
   WHERE a.status = 'pending' AND a.reminded_at IS NULL AND a.created_at < p_cutoff
   ORDER BY a.created_at
   LIMIT 50
$$;

CREATE OR REPLACE FUNCTION mark_approval_reminded(p_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE approval_requests SET reminded_at = now() WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION pending_approvals_due(timestamptz) TO im_omni_app;
GRANT EXECUTE ON FUNCTION mark_approval_reminded(uuid) TO im_omni_app;
