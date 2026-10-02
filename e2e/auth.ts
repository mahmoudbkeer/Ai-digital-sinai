import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { expect, type APIRequestContext } from "@playwright/test";

type RegistrationData = { email: string; password: string; displayName: string; tenantName: string };
type VerifiedIdentity = { userId: string; tenantId: string; businessId: string; branchId: string; token: string };
export async function registerVerified(request: APIRequestContext, data: RegistrationData): Promise<VerifiedIdentity> {
  const registration = await request.post("/api/platform/auth/register", { data });
  expect(registration.status()).toBe(201);
  const created = await registration.json() as Omit<VerifiedIdentity, "token">;

  // The delivery provider is intentionally absent in CI. Activate only the test user
  // and create a scoped fixture session; production never uses this helper. The
  // dedicated login spec exercises the real login endpoint and UI flow.
  const sqlitePath = resolve(process.env.SQLITE_PATH ?? ".data/dev.sqlite");
  const database = new DatabaseSync(sqlitePath);
  database.exec("PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON;");
  const stored = database.prepare("SELECT id FROM users WHERE id = ? OR email = ? LIMIT 1").get(created.userId, data.email) as { id: string } | undefined;
  if (!stored) throw new Error(`E2E registration user was not visible in ${sqlitePath}`);
  database.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(stored.id);
  const token = `e2e-session-${randomUUID()}`;
  database.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), stored.id, createHash("sha256").update(token).digest("hex"), Date.now() + 3_600_000, Date.now());
  database.close();
  return { ...created, userId: stored.id, token };
}
