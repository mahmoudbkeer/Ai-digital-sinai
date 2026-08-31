CREATE TABLE IF NOT EXISTS tenant_configurations (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'EGP',
  tax_mode TEXT NOT NULL DEFAULT 'REQUIRES_CONFIGURATION' CHECK (tax_mode IN ('REQUIRES_CONFIGURATION','EXCLUSIVE','INCLUSIVE','EXEMPT')),
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_basis_points >= 0 AND tax_rate_basis_points <= 10000),
  tax_registration_number TEXT,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  business_name TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('SALES','PROFIT','INVENTORY','CUSTOMERS','EXPENSES','OPPORTUNITY','ALERT')),
  severity TEXT NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  as_of INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_ai_insights_scope ON ai_insights(tenant_id, insight_type, created_at);

CREATE TABLE IF NOT EXISTS forecast_outputs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('SALES','EXPENSES','ORDERS','CUSTOMERS')),
  horizon_days INTEGER NOT NULL CHECK (horizon_days > 0 AND horizon_days <= 90),
  predicted_cents INTEGER,
  predicted_value REAL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  method TEXT NOT NULL CHECK (method IN ('MOVING_AVERAGE','INSUFFICIENT_DATA')),
  training_window_days INTEGER NOT NULL CHECK (training_window_days >= 0),
  evaluation_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_forecast_scope ON forecast_outputs(tenant_id, metric, created_at);

CREATE TABLE IF NOT EXISTS recommendation_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  score REAL NOT NULL CHECK (score >= 0),
  factors_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_recommendation_scope ON recommendation_events(tenant_id, user_id, created_at);

CREATE TABLE IF NOT EXISTS marketing_campaign_actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('SUBMIT','APPROVE','PAUSE','RESUME','END')),
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, campaign_id) REFERENCES ad_campaigns(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_marketing_actions_scope ON marketing_campaign_actions(tenant_id, campaign_id, created_at);
