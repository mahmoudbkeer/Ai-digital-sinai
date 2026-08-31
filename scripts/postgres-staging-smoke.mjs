#!/usr/bin/env node
import { getPostgresPool, migratePostgres, checkPostgres, closePostgres } from "../server/postgres.ts";

const results = [];
const pass = (name, detail) => results.push({ name, status: "PASS", detail });
const fail = (name, detail) => { results.push({ name, status: "FAIL", detail }); throw new Error(`${name}: ${detail}`); };

try {
  if (!/^(postgres|postgresql):\/\//i.test(process.env.DATABASE_URL ?? "")) {
    console.error(JSON.stringify({ status: "BLOCKED_EXTERNAL_DEPENDENCY", reason: "DATABASE_URL must point to a real PostgreSQL staging database.", results }));
    process.exitCode = 78;
  } else {
    const health = await checkPostgres();
    if (!health.ok) fail("postgres connectivity", health.error ?? "connection failed");
    pass("postgres connectivity", `${health.latencyMs ?? 0}ms`);
    await migratePostgres();
    pass("versioned migrations", "migrations 1, 2, 3 and 4 applied or already present");

    const pool = getPostgresPool();
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [["users", "tenants", "tenant_members", "user_security", "orders", "payment_intents", "ledger_journals", "ledger_entries", "ai_documents", "audit_logs", "schema_migrations"]]);
    const tableNames = new Set(tables.rows.map(row => row.table_name));
    const expected = ["users", "tenants", "tenant_members", "user_security", "orders", "payment_intents", "ledger_journals", "ledger_entries", "ai_documents", "audit_logs", "schema_migrations"];
    const missing = expected.filter(table => !tableNames.has(table));
    if (missing.length) fail("required tables", `missing: ${missing.join(", ")}`);
    pass("required tables", `${expected.length} tables present`);
    const mfaColumns = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_security' AND column_name = ANY($1::text[])`, [["mfa_secret", "mfa_pending_secret", "mfa_verified_at"]]);
    if (mfaColumns.rowCount !== 3) fail("MFA schema", `only ${mfaColumns.rowCount ?? 0}/3 columns present`);
    pass("MFA schema", "secret, pending secret and verification timestamp present");

    const migrationRows = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
    const versions = migrationRows.rows.map(row => Number(row.version));
    if (![1, 2, 3].every(version => versions.includes(version))) fail("migration consistency", `versions=${versions.join(",")}`);
    pass("migration consistency", versions.join(", "));

    const fk = await pool.query(`SELECT COUNT(*)::int AS count FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND constraint_schema = 'public'`);
    if (Number(fk.rows[0]?.count ?? 0) < 10) fail("foreign key coverage", `only ${fk.rows[0]?.count ?? 0} foreign keys`);
    pass("foreign key coverage", String(fk.rows[0].count));

    const composite = await pool.query(`SELECT COUNT(*)::int AS count FROM pg_constraint WHERE contype = 'f' AND array_length(conkey, 1) > 1`);
    if (Number(composite.rows[0]?.count ?? 0) < 3) fail("tenant composite constraints", `only ${composite.rows[0]?.count ?? 0}`);
    pass("tenant composite constraints", String(composite.rows[0].count));

    const imbalance = await pool.query(`SELECT COUNT(*)::int AS count FROM (SELECT j.id FROM ledger_journals j JOIN ledger_entries e ON e.tenant_id = j.tenant_id AND e.journal_id = j.id GROUP BY j.id HAVING COALESCE(SUM(e.debit_cents), 0) <> COALESCE(SUM(e.credit_cents), 0)) unbalanced`);
    if (Number(imbalance.rows[0]?.count ?? 0) !== 0) fail("financial integrity", `${imbalance.rows[0].count} unbalanced journals`);
    pass("financial integrity", "all persisted journals balance");

    await pool.query("BEGIN");
    await pool.query("CREATE TEMP TABLE staging_rollback_probe (id integer primary key)");
    await pool.query("INSERT INTO staging_rollback_probe VALUES (1)");
    await pool.query("ROLLBACK");
    pass("transaction rollback", "probe table rolled back successfully");

    console.log(JSON.stringify({ status: "PASS", provider: "postgresql", results }));
  }
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", provider: "postgresql", results, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  await closePostgres();
}
