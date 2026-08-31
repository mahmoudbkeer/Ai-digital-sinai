import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";

type SqliteStatement = { get: (...parameters: unknown[]) => unknown; all: (...parameters: unknown[]) => unknown[]; run: (...parameters: unknown[]) => unknown };
export type AppDatabase = { exec: (sql: string) => void; prepare: (sql: string) => SqliteStatement; close: () => void };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (location: string) => AppDatabase };

const schema = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked', 'disabled')),
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, expires_at);

CREATE TABLE IF NOT EXISTS user_security (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mfa_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED' CHECK (mfa_status IN ('NOT_CONFIGURED','ENABLED','REQUIRED')),
  otp_status TEXT NOT NULL DEFAULT 'READY' CHECK (otp_status IN ('READY','ENABLED','DISABLED')),
  device_verification_status TEXT NOT NULL DEFAULT 'READY' CHECK (device_verification_status IN ('READY','VERIFIED','REQUIRED')),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_members (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','PLATFORM_ADMIN','TENANT_OWNER','TENANT_ADMIN','MANAGER','ACCOUNTANT','SALES','INVENTORY_MANAGER','HR','MARKETING','EMPLOYEE','SERVICE_PROVIDER','DRIVER','CUSTOMER')),
  permissions_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id, tenant_id);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_businesses_tenant ON businesses(tenant_id);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'العريش',
  district TEXT,
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, business_id, name),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_branches_scope ON branches(tenant_id, business_id);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EGP',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, sku),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_products_scope ON products(tenant_id, business_id, status);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_services_scope ON services(tenant_id, business_id, status);

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CHECKED_OUT','ABANDONED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, user_id, status),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);
CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  created_at INTEGER NOT NULL,
  UNIQUE (cart_id, product_id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_scope ON cart_items(tenant_id, cart_id);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  offering_type TEXT NOT NULL CHECK (offering_type IN ('PRODUCT','SERVICE','FOOD','JOB','REAL_ESTATE','PROFESSIONAL','OFFER')),
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES categories(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  service_id TEXT REFERENCES services(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  created_at INTEGER NOT NULL,
  CHECK ((product_id IS NOT NULL) OR (service_id IS NOT NULL)),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
  FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
);
CREATE TABLE IF NOT EXISTS favorites (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  service_id TEXT REFERENCES services(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  CHECK ((product_id IS NOT NULL) OR (service_id IS NOT NULL)),
  UNIQUE (tenant_id, user_id, product_id, service_id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
  FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS inventory_stock (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, branch_id, product_id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_scope ON inventory_movements(tenant_id, branch_id, product_id, created_at);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','CONFIRMED','PROCESSING','READY','OUT_FOR_DELIVERY','COMPLETED','CANCELLED','REFUNDED')),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EGP',
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_orders_scope ON orders(tenant_id, business_id, branch_id, state, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS ledger_journals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  memo TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_ledger_journals_scope ON ledger_journals(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL REFERENCES ledger_journals(id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  line_no INTEGER NOT NULL,
  debit_cents INTEGER NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  created_at INTEGER NOT NULL,
  CHECK ((debit_cents > 0 AND credit_cents = 0) OR (credit_cents > 0 AND debit_cents = 0)),
  UNIQUE (journal_id, line_no),
  FOREIGN KEY (tenant_id, account_id) REFERENCES ledger_accounts(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(tenant_id, account_id, created_at);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  signature_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('VERIFIED_PENDING','PROCESSED','REJECTED')),
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_event ON payment_webhook_events(provider, event_id, received_at);

CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EGP',
  status TEXT NOT NULL CHECK (status IN ('REQUIRES_SETUP','REQUIRES_ACTION','AUTHORIZED','CAPTURED','FAILED','REFUNDED')),
  provider_reference TEXT,
  idempotency_key TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days BETWEEN 0 AND 90),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS entitlements (
  plan_code TEXT NOT NULL REFERENCES plans(code) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  limit_value INTEGER,
  PRIMARY KEY (plan_code, feature)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_code TEXT NOT NULL REFERENCES plans(code) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('TRIALING','ACTIVE','PAST_DUE','CANCELLED','EXPIRED')),
  current_period_start INTEGER NOT NULL,
  current_period_end INTEGER NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS ai_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  allowed_data_scope TEXT NOT NULL,
  provider_status TEXT NOT NULL CHECK (provider_status IN ('REQUIRES_SETUP','QUEUED','COMPLETED','FAILED')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_requests_scope ON ai_requests(tenant_id, user_id, created_at);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  license_number TEXT,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','ASSIGNED','OFFLINE','SUSPENDED')),
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plate_number TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MAINTENANCE','INACTIVE')),
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, plate_number),
  UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','FAILED','CANCELLED')),
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, order_id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id),
  FOREIGN KEY (tenant_id, driver_id) REFERENCES drivers(tenant_id, id),
  FOREIGN KEY (tenant_id, vehicle_id) REFERENCES vehicles(tenant_id, id)
);
CREATE TABLE IF NOT EXISTS delivery_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
  state TEXT NOT NULL,
  note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id, delivery_id) REFERENCES deliveries(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_deliveries_scope ON deliveries(tenant_id, state, updated_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP','PUSH','SMS','EMAIL')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','FAILED','READ')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP','PUSH','SMS','EMAIL')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  PRIMARY KEY (tenant_id, user_id, channel)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  request_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_scope ON audit_logs(tenant_id, created_at);
`;

let database: AppDatabase | undefined;

export function getDatabase(): AppDatabase {
  if (database) return database;
  const configured = process.env.DATABASE_URL;
  const dbPath = configured?.startsWith("sqlite://")
    ? configured.slice("sqlite://".length)
    : process.env.SQLITE_PATH ?? path.resolve(process.cwd(), ".data", "ai-digital-sinai.sqlite");
  if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
  database = new DatabaseSync(dbPath);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  database.exec(schema);
  const applied = database.prepare("SELECT version FROM schema_migrations WHERE version = 1").get() as { version?: number } | undefined;
  if (!applied) database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(1, Date.now());
  const planInsert = database.prepare("INSERT OR IGNORE INTO plans (code, name, price_cents, trial_days, active, created_at) VALUES (?, ?, ?, ?, 1, ?)");
  for (const plan of [["trial", "التجربة", 0, 14], ["starter", "الأساسية", 49900, 0], ["growth", "النمو", 99900, 0], ["business", "الأعمال", 199900, 0], ["enterprise", "المؤسسات", 499900, 0]] as const) planInsert.run(...plan, Date.now());
  const accountInsert = database.prepare("INSERT OR IGNORE INTO ledger_accounts (id, tenant_id, code, name, account_type, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  for (const tenant of database.prepare("SELECT id FROM tenants").all() as Array<{ id: string }>) for (const account of [["1000", "النقدية", "ASSET"], ["1100", "المخزون", "ASSET"], ["1200", "الذمم المدينة", "ASSET"], ["4000", "المبيعات", "REVENUE"], ["5000", "تكلفة المبيعات", "EXPENSE"]] as const) accountInsert.run(randomUUID(), tenant.id, ...account, Date.now());
  return database;
}

export function withTransaction<T>(db: AppDatabase, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function resetDatabaseForTests(): void {
  database?.close();
  database = undefined;
}
