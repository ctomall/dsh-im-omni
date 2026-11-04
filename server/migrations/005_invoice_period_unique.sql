-- One invoice per tenant per billing period; the generator relies on this to be
-- idempotent (running it twice must not double-bill).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_period_unique ON invoices (tenant_id, period);
