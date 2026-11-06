-- Track when the owner was reminded about a stale pending approval, so the sweep
-- nudges once per request instead of every tick.
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
