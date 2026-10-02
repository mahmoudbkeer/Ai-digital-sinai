import { createHash, randomUUID } from "node:crypto";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlatformRouter, platformErrorHandler } from "./platform";
import { getDatabase, resetDatabaseForTests } from "./database";

let server: ReturnType<typeof import("node:http").createServer>;
let baseUrl = "";

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
}

async function register(email: string) {
  const response = await request("/api/platform/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "secure-password-123", displayName: "Reset User", tenantName: `Reset Tenant ${randomUUID()}` }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { userId: string; tenantId: string };
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function seedResetToken(userId: string, token: string, expiresAt = Date.now() + 30 * 60 * 1000) {
  getDatabase().prepare("INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), userId, tokenHash(token), expiresAt, Date.now());
}

beforeAll(async () => {
  process.env.DATABASE_URL = "";
  process.env.SQLITE_PATH = ":memory:";
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use("/api/platform", createPlatformRouter());
  app.use(platformErrorHandler);
  server = (await import("node:http")).createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server failed");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => { server.close(); resetDatabaseForTests(); });

describe("password reset security", () => {
  it("returns the same accepted response for existing and unknown emails and invalidates prior tokens", async () => {
    const identity = await register("reset-existing@example.com");
    const oldToken = "old-reset-token-for-invalidation";
    seedResetToken(identity.userId, oldToken);
    const existing = await request("/api/platform/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email: "RESET-EXISTING@example.com" }) });
    const unknown = await request("/api/platform/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email: "unknown-reset@example.com" }) });
    expect(existing.status).toBe(202);
    expect(unknown.status).toBe(202);
    await expect(existing.json()).resolves.toEqual(await unknown.json());
    const replay = await request("/api/platform/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: oldToken, password: "new-secure-password-123" }) });
    expect(replay.status).toBe(400);
  });

  it("changes the password atomically, revokes sessions, and rejects token replay", async () => {
    const identity = await register("reset-valid@example.com");
    const resetToken = "valid-reset-token-for-test";
    seedResetToken(identity.userId, resetToken);
    const sessionToken = "existing-session-to-revoke";
    getDatabase().prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), identity.userId, tokenHash(sessionToken), Date.now() + 3_600_000, Date.now());
    const response = await request("/api/platform/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: resetToken, password: "new-secure-password-123" }) });
    expect(response.status).toBe(200);
    const replay = await request("/api/platform/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: resetToken, password: "another-secure-password-123" }) });
    expect(replay.status).toBe(400);
    const state = getDatabase().prepare("SELECT used_at FROM password_reset_tokens WHERE token_hash = ?").get(tokenHash(resetToken)) as { used_at: number | null };
    const session = getDatabase().prepare("SELECT revoked_at FROM sessions WHERE token_hash = ?").get(tokenHash(sessionToken)) as { revoked_at: number | null };
    expect(state.used_at).not.toBeNull();
    expect(session.revoked_at).not.toBeNull();
    const audit = getDatabase().prepare("SELECT action, metadata_json FROM audit_logs WHERE actor_user_id = ? AND action LIKE 'auth.password_reset.%' ORDER BY created_at").all(identity.userId) as Array<{ action: string; metadata_json: string }>;
    expect(audit.map(row => row.action)).toContain("auth.password_reset.completed");
    expect(audit.some(row => row.metadata_json.includes(resetToken))).toBe(false);
  });

  it("allows only one concurrent confirmation to consume a token", async () => {
    const identity = await register("reset-concurrent@example.com");
    const resetToken = "concurrent-reset-token-for-test";
    seedResetToken(identity.userId, resetToken);
    const responses = await Promise.all([
      request("/api/platform/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: resetToken, password: "concurrent-password-one" }) }),
      request("/api/platform/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: resetToken, password: "concurrent-password-two" }) }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 400]);
  });

  it("rejects expired and malformed tokens without revealing account state", async () => {
    const identity = await register("reset-expired@example.com");
    const expiredToken = "expired-reset-token-for-test";
    seedResetToken(identity.userId, expiredToken, Date.now() - 1);
    const expired = await request("/api/platform/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: expiredToken, password: "expired-password-123" }) });
    const malformed = await request("/api/platform/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: "does-not-exist", password: "malformed-password-123" }) });
    expect(expired.status).toBe(400);
    expect(malformed.status).toBe(400);
    await expect(expired.json()).resolves.toMatchObject({ error: "invalid-reset" });
    await expect(malformed.json()).resolves.toMatchObject({ error: "invalid-reset" });
  });

  it("rate-limits repeated invalid confirmation attempts", async () => {
    const responses = [] as Response[];
    for (let index = 0; index < 11; index += 1) {
      responses.push(await request("/api/platform/auth/password-reset/confirm", { method: "POST", headers: { "x-forwarded-for": "198.51.100.42" }, body: JSON.stringify({ token: `invalid-${index}`, password: "invalid-password-123" }) }));
    }
    expect(responses.slice(0, 10).every(response => response.status === 400)).toBe(true);
    expect(responses[10].status).toBe(429);
  });
});
