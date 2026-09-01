#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import path from "node:path";

const exec = promisify(execFile);
const root = process.cwd();
const outputDir = process.env.BACKUP_DIR ?? path.resolve(root, ".backups");
const retention = Math.min(Math.max(Number(process.env.BACKUP_RETENTION ?? 14) || 14, 1), 365);
mkdirSync(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function encryptionKey() {
  const value = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!value) return null;
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be 32 bytes as base64 or 64 hex characters.");
  return key;
}
function encryptFile(input, output) {
  const key = encryptionKey();
  if (!key) return { output: input, encrypted: false };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(readFileSync(input)), cipher.final()]);
  writeFileSync(output, Buffer.concat([Buffer.from("AISB1"), iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
  unlinkSync(input);
  return { output, encrypted: true };
}
function writeManifest(output, provider, encrypted) {
  const bytes = readFileSync(output);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const manifest = `${output}.sha256.json`;
  writeFileSync(manifest, JSON.stringify({ provider, file: path.basename(output), sha256, bytes: statSync(output).size, encrypted, algorithm: encrypted ? "AES-256-GCM" : null, createdAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
  return { manifest, sha256, encrypted };
}
async function postgresBackup() {
  const raw = path.join(outputDir, `ai-digital-sinai-${stamp}.dump`); const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) { console.error(JSON.stringify({ status: "BLOCKED", operation: "postgres-backup", message: "DATABASE_URL is required for PostgreSQL backup." })); process.exitCode = 78; return; }
  try { await exec("pg_dump", ["--format=custom", "--no-owner", "--file", raw, databaseUrl], { cwd: root }); }
  catch (error) { console.error(JSON.stringify({ status: "REQUIRES_SETUP", operation: "postgres-backup", message: error instanceof Error ? error.message : String(error) })); process.exitCode = 78; return; }
  const encrypted = Boolean(encryptionKey()); const output = encrypted ? `${raw}.enc` : raw; const secured = encryptFile(raw, output);
  console.log(JSON.stringify({ status: "COMPLETED", provider: "postgresql", output: secured.output, ...writeManifest(secured.output, "postgresql", secured.encrypted), retention }));
}
function sqliteBackup() {
  const source = process.env.SQLITE_PATH ?? path.resolve(root, ".data", "ai-digital-sinai.sqlite");
  if (source === ":memory:" || !existsSync(source)) { console.error(JSON.stringify({ status: "BLOCKED", operation: "sqlite-backup", message: "SQLite file is not available; set SQLITE_PATH to a persistent file." })); process.exitCode = 78; return; }
  const raw = path.join(outputDir, `ai-digital-sinai-${stamp}.sqlite`); copyFileSync(source, raw); const encrypted = Boolean(encryptionKey()); const output = encrypted ? `${raw}.enc` : raw; const secured = encryptFile(raw, output);
  console.log(JSON.stringify({ status: "COMPLETED", provider: "sqlite", output: secured.output, ...writeManifest(secured.output, "sqlite", secured.encrypted), retention }));
}
async function main() {
  try { if (/^(postgres|postgresql):\/\//i.test(process.env.DATABASE_URL ?? "")) await postgresBackup(); else sqliteBackup(); }
  catch (error) { console.error(JSON.stringify({ status: "FAILED", operation: "backup", message: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; }
  const backups = readdirSync(outputDir).filter(file => file.startsWith("ai-digital-sinai-") && !file.endsWith(".sha256.json")).sort().reverse();
  for (const old of backups.slice(retention)) { try { unlinkSync(path.join(outputDir, old)); unlinkSync(`${path.join(outputDir, old)}.sha256.json`); } catch { process.exitCode = 1; } }
}
await main();
