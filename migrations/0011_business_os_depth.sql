CREATE TABLE IF NOT EXISTS sales_returns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','CANCELLED')),
  reason TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  idempotency_key TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_sales_returns_scope ON sales_returns(tenant_id, order_id, created_at);
CREATE TABLE IF NOT EXISTS sales_return_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  return_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_refund_cents INTEGER NOT NULL CHECK (unit_refund_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, return_id) REFERENCES sales_returns(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE TABLE IF NOT EXISTS purchase_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  purchase_id TEXT NOT NULL,
  purchase_item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, purchase_id) REFERENCES purchases(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, purchase_item_id) REFERENCES purchase_items(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_scope ON purchase_receipts(tenant_id, purchase_id);
CREATE TABLE IF NOT EXISTS supplier_returns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  purchase_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','CANCELLED')),
  reason TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  idempotency_key TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, purchase_id) REFERENCES purchases(tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);
CREATE TABLE IF NOT EXISTS supplier_return_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  return_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, return_id) REFERENCES supplier_returns(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_scope ON supplier_returns(tenant_id, supplier_id, created_at);
CREATE TABLE IF NOT EXISTS reconciliations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL,
  period_from INTEGER NOT NULL,
  period_to INTEGER NOT NULL,
  expected_cents INTEGER NOT NULL,
  actual_cents INTEGER NOT NULL,
  variance_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('MATCHED','VARIANCE')),
  note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_reconciliations_scope ON reconciliations(tenant_id, account_code, period_from, period_to);
CREATE TABLE IF NOT EXISTS customer_segments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS customer_segment_members (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  matched_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, segment_id, customer_id),
  FOREIGN KEY (tenant_id, segment_id) REFERENCES customer_segments(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_customer_segments_scope ON customer_segment_members(tenant_id, segment_id);
