import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolConfig } from "pg";

let pool: Pool | undefined;

export function isPostgresUrl(value = process.env.DATABASE_URL): boolean {
  return Boolean(value && /^(postgres|postgresql):\/\//i.test(value));
}

export function getPostgresPool(): Pool {
  if (!isPostgresUrl()) throw new Error("DATABASE_URL must be a postgres:// or postgresql:// URL");
  if (!pool) {
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX ?? 20),
      min: Number(process.env.PG_POOL_MIN ?? 2),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 5_000),
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 15_000),
      ssl: process.env.PG_SSL === "require" ? { rejectUnauthorized: true } : undefined,
    };
    pool = new Pool(config);
    pool.on("error", (error) => console.error(JSON.stringify({ event: "postgres_pool_error", error: error.message })));
  }
  return pool;
}

export async function checkPostgres(): Promise<{ ok: boolean; provider: "postgresql"; latencyMs?: number; error?: string }> {
  const started = Date.now();
  try { await getPostgresPool().query("SELECT 1"); return { ok: true, provider: "postgresql", latencyMs: Date.now() - started }; }
  catch (error) { return { ok: false, provider: "postgresql", latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "postgres connection failed" }; }
}

export async function migratePostgres(): Promise<void> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [894217]);
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)");
    const migration = readFileSync(path.resolve(process.cwd(), "migrations/postgres/0001_core.sql"), "utf8");
    const existing = await client.query("SELECT version FROM schema_migrations WHERE version = $1", [1]);
    if (existing.rowCount === 0) { await client.query(migration); await client.query("INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)", [1, Date.now()]); }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function closePostgres(): Promise<void> { if (pool) { await pool.end(); pool = undefined; } }
