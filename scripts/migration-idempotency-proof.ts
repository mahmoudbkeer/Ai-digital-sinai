import { getDatabase } from "../server/database";

const db = getDatabase();
const before = db.prepare("SELECT version, applied_at FROM schema_migrations ORDER BY version").all() as Array<{ version: number; applied_at: number }>;
const reopened = getDatabase();
const after = reopened.prepare("SELECT version, applied_at FROM schema_migrations ORDER BY version").all() as Array<{ version: number; applied_at: number }>;
const versions = after.map(row => Number(row.version));
const uniqueVersions = new Set(versions);
const pass = before.length === after.length && uniqueVersions.size === versions.length && versions.every((version, index) => version === Number((before[index] as { version: number }).version));
const result = { status: pass ? "PASS" : "FAIL", beforeCount: before.length, afterCount: after.length, versions };
console.log(JSON.stringify(result));
if (!pass) process.exit(1);
