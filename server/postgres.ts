import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolConfig } from "pg";

let pool: Pool | undefined;

export function isPostgresUrl(value = process.env.DATABASE_URL): boolean {
  return Boolean(value && /^(postgres|postgresql):\/\//i.test(value));
}

export function getPostgresPool(): Pool {
  if (!isPostgresUrl())
    throw new Error("DATABASE_URL must be a postgres:// or postgresql:// URL");
  if (!pool) {
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX ?? 20),
      min: Number(process.env.PG_POOL_MIN ?? 2),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
      connectionTimeoutMillis: Number(
        process.env.PG_CONNECTION_TIMEOUT_MS ?? 5_000
      ),
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 15_000),
      ssl:
        process.env.PG_SSL === "require"
          ? { rejectUnauthorized: true }
          : undefined,
    };
    pool = new Pool(config);
    pool.on("error", error =>
      console.error(
        JSON.stringify({ event: "postgres_pool_error", error: error.message })
      )
    );
  }
  return pool;
}

export async function checkPostgres(): Promise<{
  ok: boolean;
  provider: "postgresql";
  latencyMs?: number;
  error?: string;
}> {
  const started = Date.now();
  try {
    await getPostgresPool().query("SELECT 1");
    return {
      ok: true,
      provider: "postgresql",
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "postgresql",
      latencyMs: Date.now() - started,
      error:
        error instanceof Error ? error.message : "postgres connection failed",
    };
  }
}

export async function migratePostgres(): Promise<void> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [894217]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)"
    );
    for (const version of [1, 2, 3, 4, 5, 6]) {
      const existing = await client.query(
        "SELECT version FROM schema_migrations WHERE version = $1",
        [version]
      );
      if (existing.rowCount === 0) {
        const migration = readFileSync(
          path.resolve(
            process.cwd(),
            `migrations/postgres/${String(version).padStart(4, "0")}_${version === 1 ? "core" : version === 2 ? "business_os" : version === 3 ? "productization" : version === 4 ? "mfa" : version === 5 ? "service_booking" : "notification_delivery_status"}.sql`
          ),
          "utf8"
        );
        await client.query(migration);
        await client.query(
          "INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)",
          [version, Date.now()]
        );
      }
    }
    const plans: Array<[string, string, number, number]> = [
      ["trial", "التجربة", 0, 14],
      ["starter", "الأساسية", 49900, 0],
      ["growth", "النمو", 99900, 0],
      ["business", "الأعمال", 199900, 0],
      ["enterprise", "المؤسسات", 499900, 0],
    ];
    for (const [code, name, priceCents, trialDays] of plans)
      await client.query(
        "INSERT INTO plans (code, name, price_cents, trial_days, active, created_at) VALUES ($1, $2, $3, $4, 1, $5) ON CONFLICT (code) DO NOTHING",
        [code, name, priceCents, trialDays, Date.now()]
      );
    const entitlements: Array<[string, string, number | null]> = [
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
    ];
    for (const entitlement of entitlements)
      await client.query(
        "INSERT INTO entitlements (plan_code, feature, limit_value) VALUES ($1, $2, $3) ON CONFLICT (plan_code, feature) DO NOTHING",
        entitlement
      );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
