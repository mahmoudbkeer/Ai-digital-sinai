#!/usr/bin/env node
import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createDecipheriv, createHash } from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const root = process.cwd();
const source = process.argv[2];
if (!source || !existsSync(source)) { console.error(JSON.stringify({ status: "BLOCKED", message: "Provide an existing backup path as the first argument." })); process.exit(2); }
const manifestPath = `${source}.sha256.json`;
let manifest;
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const sha256 = createHash("sha256").update(readFileSync(source)).digest("hex");
    if (manifest.sha256 !== sha256) throw new Error("Backup checksum mismatch.");
  } catch (error) { console.error(JSON.stringify({ status: "FAILED", operation: "integrity-verification", message: error instanceof Error ? error.message : String(error) })); process.exit(1); }
} else if (process.env.ALLOW_LEGACY_BACKUP !== "1") {
  console.error(JSON.stringify({ status: "BLOCKED", operation: "integrity-verification", message: "Backup manifest is missing; set ALLOW_LEGACY_BACKUP=1 only for explicitly trusted legacy backups." })); process.exit(78);
}
function keyFromEnv() {
  const value = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!value) return null;
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be 32 bytes as base64 or 64 hex characters.");
  return key;
}
function decryptIfNeeded() {
  if (!manifest?.encrypted) return source;
  const key = keyFromEnv(); if (!key) throw new Error("Encrypted backup requires BACKUP_ENCRYPTION_KEY.");
  const payload = readFileSync(source); if (payload.subarray(0, 5).toString() !== "AISB1") throw new Error("Unsupported encrypted backup format.");
  const iv = payload.subarray(5, 17); const tag = payload.subarray(17, 33); const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(payload.subarray(33)), decipher.final()]);
  const extension = manifest.provider === "postgresql" ? ".dump" : ".sqlite";
  const temp = path.join("/tmp", `ai-sinai-restore-${process.pid}${extension}`); writeFileSync(temp, decrypted, { mode: 0o600 }); return temp;
}
let usableSource;
try { usableSource = decryptIfNeeded(); } catch (error) { console.error(JSON.stringify({ status: "FAILED", operation: "decrypt", message: error instanceof Error ? error.message : String(error) })); process.exit(1); }
try {
  if (/^(postgres|postgresql):\/\//i.test(process.env.DATABASE_URL ?? "")) {
    await exec("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", process.env.DATABASE_URL, usableSource], { cwd: root });
    console.log(JSON.stringify({ status: "COMPLETED", provider: "postgresql", source, encrypted: Boolean(manifest?.encrypted) }));
  } else {
    const target = process.env.SQLITE_PATH ?? path.resolve(root, ".data", "ai-digital-sinai.sqlite"); if (target === ":memory:") { console.error(JSON.stringify({ status: "BLOCKED", message: "SQLite restore requires a persistent SQLITE_PATH." })); process.exit(78); }
    mkdirSync(path.dirname(target), { recursive: true }); const safety = `${target}.before-restore-${Date.now()}`; if (existsSync(target)) copyFileSync(target, safety); copyFileSync(usableSource, target); console.log(JSON.stringify({ status: "COMPLETED", provider: "sqlite", source, target, encrypted: Boolean(manifest?.encrypted), safetyBackup: safety }));
  }
} catch (error) { console.error(JSON.stringify({ status: "FAILED", operation: "restore", message: error instanceof Error ? error.message : String(error) })); process.exit(1); }
if (usableSource !== source) { try { unlinkSync(usableSource); } catch {} }
