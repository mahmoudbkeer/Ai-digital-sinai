CREATE TABLE IF NOT EXISTS delivery_zones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  name TEXT NOT NULL,
  center_latitude REAL NOT NULL CHECK (center_latitude BETWEEN -90 AND 90),
  center_longitude REAL NOT NULL CHECK (center_longitude BETWEEN -180 AND 180),
  radius_meters INTEGER NOT NULL CHECK (radius_meters > 0),
  base_fee_cents INTEGER NOT NULL CHECK (base_fee_cents >= 0),
  per_km_cents INTEGER NOT NULL CHECK (per_km_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, branch_id, name),
  FOREIGN KEY (tenant_id, business_id) REFERENCES businesses(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_scope ON delivery_zones(tenant_id, branch_id, active);
CREATE TABLE IF NOT EXISTS delivery_location_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delivery_id TEXT NOT NULL,
  driver_id TEXT,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters REAL CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  recorded_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, delivery_id) REFERENCES deliveries(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, driver_id) REFERENCES drivers(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_locations_scope ON delivery_location_events(tenant_id, delivery_id, recorded_at);
