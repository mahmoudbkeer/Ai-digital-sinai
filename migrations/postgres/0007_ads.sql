CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('PRODUCT','SERVICE','BUSINESS')),
  resource_id TEXT NOT NULL,
  placement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','ACTIVE','EXPIRED')),
  budget_cents INTEGER,
  duration_days INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  expires_at INTEGER,
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_ads_marketplace ON ads(tenant_id, status, placement, expires_at);
