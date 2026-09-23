ALTER TABLE expenses ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_tenant_idempotency ON expenses(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
