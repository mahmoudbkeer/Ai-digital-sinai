import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

type SqliteStatement = {
  get: (...parameters: unknown[]) => unknown;
  all: (...parameters: unknown[]) => unknown[];
  run: (...parameters: unknown[]) => unknown;
};
export type AppDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (location: string) => AppDatabase;
};

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
  status TEXT NOT NULL CHECK (status IN ('TRIALING','ACTIVE','PAST_DUE','PENDING_PAYMENT','CANCELLED','EXPIRED')),
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
  state TEXT NOT NULL DEFAULT 'CREATED' CHECK (state IN ('CREATED','PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','FAILED','CANCELLED')),
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, order_id),
  UNIQUE (tenant_id, id),
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
CREATE TABLE IF NOT EXISTS delivery_proofs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
  proof_type TEXT NOT NULL CHECK (proof_type IN ('PHOTO','SIGNATURE','OTP','NOTE')),
  storage_ref TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  recipient_name TEXT,
  captured_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  captured_at INTEGER NOT NULL,
  UNIQUE (tenant_id, delivery_id),
  FOREIGN KEY (tenant_id, delivery_id) REFERENCES deliveries(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP','PUSH','SMS','EMAIL')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED','READ')),
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP','PUSH','SMS','EMAIL')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  PRIMARY KEY (tenant_id, user_id, channel)
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT','ISSUED','PAID','VOID','REFUNDED')),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EGP',
  issued_at INTEGER NOT NULL,
  UNIQUE (tenant_id, invoice_number),
  UNIQUE (tenant_id, order_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
);
CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_intent_id TEXT REFERENCES payment_intents(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('REQUESTED','REQUIRES_SETUP','PROCESSING','REFUNDED','FAILED')),
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS ai_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  permission_scope_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','PENDING')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, source_type, source_ref),
  UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS ai_chunks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding_provider TEXT,
  embedding_ref TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, document_id, chunk_index),
  FOREIGN KEY (tenant_id, document_id) REFERENCES ai_documents(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_scope ON ai_chunks(tenant_id, document_id, chunk_index);

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL REFERENCES ai_requests(id) ON DELETE RESTRICT,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  cost_cents INTEGER CHECK (cost_cents IS NULL OR cost_cents >= 0),
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_scope ON ai_usage(tenant_id, user_id, feature, created_at);
CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  tenant_scope TEXT NOT NULL,
  tool_allowlist_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('VERIFIED_PENDING','BLOCKED_POLICY','REQUIRES_SETUP','COMPLETED','FAILED')),
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS geo_places (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('BUSINESS','BRANCH','SERVICE','DELIVERY_ZONE')),
  entity_id TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'العريش',
  district TEXT,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  radius_meters INTEGER CHECK (radius_meters IS NULL OR radius_meters > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_geo_places_scope ON geo_places(tenant_id, entity_type, city, district);

CREATE TABLE IF NOT EXISTS advertisers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','PENDING')),
  billing_account_ref TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id)
);
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL REFERENCES advertisers(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_REVIEW','ACTIVE','PAUSED','ENDED','REJECTED')),
  budget_cents INTEGER NOT NULL CHECK (budget_cents >= 0),
  spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (spent_cents >= 0),
  targeting_json TEXT NOT NULL DEFAULT '{}',
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, advertiser_id) REFERENCES advertisers(tenant_id, id),
  CHECK (spent_cents <= budget_cents)
);
CREATE TABLE IF NOT EXISTS ad_creatives (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  headline TEXT NOT NULL,
  body TEXT,
  asset_ref TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','REJECTED')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id, campaign_id) REFERENCES ad_campaigns(tenant_id, id)
);
CREATE TABLE IF NOT EXISTS ad_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('IMPRESSION','CLICK','CONVERSION')),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, event_key),
  FOREIGN KEY (tenant_id, campaign_id) REFERENCES ad_campaigns(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP','PUSH','SMS','EMAIL')),
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, code, channel)
);
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED','REQUIRES_SETUP')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  next_attempt_at INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, notification_id, provider),
  FOREIGN KEY (tenant_id, notification_id) REFERENCES notifications(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  rollout_percent INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0 CHECK (is_secret IN (0,1)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
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
  if (
    configured &&
    /^(postgres|postgresql|mysql|mariadb):\/\//i.test(configured) &&
    !process.env.SQLITE_PATH
  )
    throw new Error(
      "A production DATABASE_URL was provided; use the PostgreSQL adapter or set SQLITE_PATH explicitly for local development."
    );
  const dbPath = configured?.startsWith("sqlite://")
    ? configured.slice("sqlite://".length)
    : (process.env.SQLITE_PATH ??
      path.resolve(process.cwd(), ".data", "ai-digital-sinai.sqlite"));
  if (dbPath !== ":memory:")
    mkdirSync(path.dirname(dbPath), { recursive: true });
  database = new DatabaseSync(dbPath);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  database.exec(schema);
  const applied = database
    .prepare("SELECT version FROM schema_migrations WHERE version = 1")
    .get() as { version?: number } | undefined;
  if (!applied)
    database
      .prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)"
      )
      .run(1, Date.now());
  const appliedBusinessOs = database
    .prepare("SELECT version FROM schema_migrations WHERE version = 2")
    .get() as { version?: number } | undefined;
  if (!appliedBusinessOs) {
    database.exec(
      readFileSync(
        path.resolve(process.cwd(), "migrations/0002_business_os.sql"),
        "utf8"
      )
    );
    database
      .prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)"
      )
      .run(2, Date.now());
  }
  const appliedProductization = database
    .prepare("SELECT version FROM schema_migrations WHERE version = 3")
    .get() as { version?: number } | undefined;
  if (!appliedProductization) {
    database.exec(
      readFileSync(
        path.resolve(process.cwd(), "migrations/0003_productization.sql"),
        "utf8"
      )
    );
    database
      .prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)"
      )
      .run(3, Date.now());
  }
  const appliedMfa = database
    .prepare("SELECT version FROM schema_migrations WHERE version = 4")
    .get() as { version?: number } | undefined;
  if (!appliedMfa) {
    database.exec(
      readFileSync(path.resolve(process.cwd(), "migrations/0004_mfa.sql"), "utf8")
    );
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(4, Date.now());
  }
  const appliedServiceBooking = database
    .prepare("SELECT version FROM schema_migrations WHERE version = 5")
    .get() as { version?: number } | undefined;
  if (!appliedServiceBooking) {
    database.exec(
      readFileSync(path.resolve(process.cwd(), "migrations/0005_service_booking.sql"), "utf8")
    );
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(5, Date.now());
  }
  const planInsert = database.prepare(
    "INSERT OR IGNORE INTO plans (code, name, price_cents, trial_days, active, created_at) VALUES (?, ?, ?, ?, 1, ?)"
  );
  for (const plan of [
    ["trial", "التجربة", 0, 14],
    ["starter", "الأساسية", 49900, 0],
    ["growth", "النمو", 99900, 0],
    ["business", "الأعمال", 199900, 0],
    ["enterprise", "المؤسسات", 499900, 0],
  ] as const)
    planInsert.run(...plan, Date.now());
  const entitlementInsert = database.prepare(
    "INSERT OR IGNORE INTO entitlements (plan_code, feature, limit_value) VALUES (?, ?, ?)"
  );
  for (const entitlement of [
    ["trial", "catalog.read", null],
    ["trial", "analytics.read", null],
    ["starter", "catalog.read", null],
    ["growth", "catalog.read", null],
    ["growth", "analytics.read", null],
    ["business", "catalog.read", null],
    ["business", "analytics.read", null],
    ["business", "inventory.manage", null],
    ["enterprise", "catalog.read", null],
    ["enterprise", "analytics.read", null],
    ["enterprise", "inventory.manage", null],
    ["enterprise", "ai.advanced", null],
  ] as const)
    entitlementInsert.run(...entitlement);
  const accountInsert = database.prepare(
    "INSERT OR IGNORE INTO ledger_accounts (id, tenant_id, code, name, account_type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const tenant of database
    .prepare("SELECT id FROM tenants")
    .all() as Array<{ id: string }>)
    for (const account of [
      ["1000", "النقدية", "ASSET"],
      ["1100", "المخزون", "ASSET"],
      ["1200", "الذمم المدينة", "ASSET"],
      ["2000", "الدائنون", "LIABILITY"],
      ["4000", "المبيعات", "REVENUE"],
      ["5000", "تكلفة المبيعات", "EXPENSE"],
    ] as const)
      accountInsert.run(randomUUID(), tenant.id, ...account, Date.now());
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
