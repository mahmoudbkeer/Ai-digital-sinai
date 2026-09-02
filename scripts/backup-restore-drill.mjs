import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const source = path.resolve(root, ".data", "ai-digital-sinai.sqlite");
const drill = path.resolve(root, ".drill-backup");
const restoreTarget = path.join(drill, "restore.sqlite");
const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
if (!existsSync(source)) throw new Error(`SQLite source missing: ${source}`);
rmSync(drill, { recursive: true, force: true });
mkdirSync(drill, { recursive: true });
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const originalHash = hash(source);
execFileSync("node", ["scripts/backup.mjs"], { cwd: root, env: { ...process.env, SQLITE_PATH: source, BACKUP_DIR: drill, BACKUP_ENCRYPTION_KEY: key, BACKUP_RETENTION: "10" }, stdio: "pipe" });
const encrypted = readdirSync(drill).find(name => name.endsWith(".sqlite.enc"));
if (!encrypted) throw new Error("Encrypted backup was not produced");
const backup = path.join(drill, encrypted);
copyFileSync(source, restoreTarget);
writeFileSync(restoreTarget, Buffer.concat([readFileSync(restoreTarget), Buffer.from("corruption")]))
execFileSync("node", ["scripts/restore.mjs", backup], { cwd: root, env: { ...process.env, SQLITE_PATH: restoreTarget, BACKUP_ENCRYPTION_KEY: key }, stdio: "pipe" });
const restoredHash = hash(restoreTarget);
const result = { status: originalHash === restoredHash ? "PASS" : "FAIL", encrypted: true, originalHash, restoredHash, backup: path.relative(root, backup) };
console.log(JSON.stringify(result));
if (result.status !== "PASS") process.exit(1);
