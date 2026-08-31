#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import path from "node:path";

const exec = promisify(execFile);
const root = process.cwd();
const outputDir = process.env.BACKUP_DIR ?? path.resolve(root, ".backups");
const retention = Math.min(Math.max(Number(process.env.BACKUP_RETENTION ?? 14) || 14, 1), 365);
mkdirSync(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

async function postgresBackup() {
  const output = path.join(outputDir, `ai-digital-sinai-${stamp}.dump`); const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) { console.error(JSON.stringify({ status: "BLOCKED", operation: "postgres-backup", message: "DATABASE_URL is required for PostgreSQL backup." })); process.exitCode = 78; return; }
  try { await exec("pg_dump", ["--format=custom", "--no-owner", "--file", output, databaseUrl], { cwd: root }); }
  catch (error) { console.error(JSON.stringify({ status: "REQUIRES_SETUP", operation: "postgres-backup", message: error instanceof Error ? error.message : String(error) })); process.exitCode = 78; return; }
  console.log(JSON.stringify({ status: "COMPLETED", provider: "postgresql", output, retention }));
}

function sqliteBackup() {
  const source = process.env.SQLITE_PATH ?? path.resolve(root, ".data", "ai-digital-sinai.sqlite");
  if (source === ":memory:" || !existsSync(source)) { console.error(JSON.stringify({ status: "BLOCKED", operation: "sqlite-backup", message: "SQLite file is not available; set SQLITE_PATH to a persistent file." })); process.exitCode = 78; return; }
  const output = path.join(outputDir, `ai-digital-sinai-${stamp}.sqlite`); copyFileSync(source, output); console.log(JSON.stringify({ status: "COMPLETED", provider: "sqlite", output, bytes: statSync(output).size, retention }));
}

async function main() {
  if (/^(postgres|postgresql):\/\//i.test(process.env.DATABASE_URL ?? "")) await postgresBackup(); else sqliteBackup();
  const backups = readdirSync(outputDir).filter((file) => file.startsWith("ai-digital-sinai-")).sort().reverse(); for (const old of backups.slice(retention)) { try { const fs = await import("node:fs/promises"); await fs.unlink(path.join(outputDir, old)); } catch { process.exitCode = 1; } }
}
await main();
