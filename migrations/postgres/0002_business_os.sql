CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  branch_id TEXT,
  employee_code TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  pin_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  permissions_json TEXT NOT NULL DEFAULT '[]',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, employee_code),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_employees_scope ON employees(tenant_id, branch_id, status);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_suppliers_scope ON suppliers(tenant_id, status);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  business_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','RECEIVED','CANCELLED','RETURNED')),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  idempotency_key TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_purchases_scope ON purchases(tenant_id, supplier_id, status, created_at);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  purchase_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, purchase_id) REFERENCES purchases(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_scope ON purchase_items(tenant_id, purchase_id);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  business_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','CANCELLED')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_expenses_scope ON expenses(tenant_id, business_id, branch_id, created_at);

CREATE TABLE IF NOT EXISTS customer_interactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_scope ON customer_interactions(tenant_id, customer_id, created_at);

CREATE TABLE IF NOT EXISTS customer_tags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS customer_tag_links (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, customer_id, tag_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id),
  FOREIGN KEY (tenant_id, tag_id) REFERENCES customer_tags(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS pos_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL,
  cashier_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  employee_id TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  opening_balance_cents INTEGER NOT NULL CHECK (opening_balance_cents >= 0),
  closing_balance_cents INTEGER,
  opened_at BIGINT NOT NULL,
  closed_at BIGINT,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, employee_id) REFERENCES employees(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_scope ON pos_sessions(tenant_id, branch_id, status, opened_at);
CREATE TABLE IF NOT EXISTS pos_cash_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('IN','OUT')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES pos_sessions(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_pos_cash_scope ON pos_cash_movements(tenant_id, session_id, created_at);
CREATE TABLE IF NOT EXISTS pos_sales (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','CARD','WALLET','OTHER')),
  created_at BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, session_id, order_id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES pos_sessions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_scope ON pos_sales(tenant_id, session_id, created_at);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENT','FIXED')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ENDED')),
  starts_at BIGINT,
  ends_at BIGINT,
  created_at BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_offers_scope ON offers(tenant_id, business_id, status);
