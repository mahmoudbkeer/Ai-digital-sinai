#!/usr/bin/env node
import { existsSync, copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const root = process.cwd();
const source = process.argv[2];
if (!source || !existsSync(source)) { console.error(JSON.stringify({ status: "BLOCKED", message: "Provide an existing backup path as the first argument." })); process.exit(2); }
const manifestPath = `${source}.sha256.json`;
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const sha256 = createHash("sha256").update(readFileSync(source)).digest("hex");
    if (manifest.sha256 !== sha256) throw new Error("Backup checksum mismatch.");
  } catch (error) {
    console.error(JSON.stringify({ status: "FAILED", operation: "integrity-verification", message: error instanceof Error ? error.message : String(error) }));
    process.exit(1);
  }
} else if (process.env.ALLOW_LEGACY_BACKUP !== "1") {
  console.error(JSON.stringify({ status: "BLOCKED", operation: "integrity-verification", message: "Backup manifest is missing; set ALLOW_LEGACY_BACKUP=1 only for explicitly trusted legacy backups." }));
  process.exit(78);
}
if (/^(postgres|postgresql):\/\//i.test(process.env.DATABASE_URL ?? "")) {
  try { await exec("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", process.env.DATABASE_URL, source], { cwd: root }); console.log(JSON.stringify({ status: "COMPLETED", provider: "postgresql", source })); }
  catch (error) { console.error(JSON.stringify({ status: "FAILED", provider: "postgresql", message: error instanceof Error ? error.message : String(error) })); process.exit(1); }
} else {
  const target = process.env.SQLITE_PATH ?? path.resolve(root, ".data", "ai-digital-sinai.sqlite"); if (target === ":memory:") { console.error(JSON.stringify({ status: "BLOCKED", message: "SQLite restore requires a persistent SQLITE_PATH." })); process.exit(78); }
  mkdirSync(path.dirname(target), { recursive: true }); const safety = `${target}.before-restore-${Date.now()}`; if (existsSync(target)) copyFileSync(target, safety); copyFileSync(source, target); console.log(JSON.stringify({ status: "COMPLETED", provider: "sqlite", source, target, safetyBackup: safety }));
}
