import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { verifyEmailCode } from "./emailVerification";

function fakeDb(record: Record<string, unknown>) {
  const updateCalls: string[] = [];
  return {
    updateCalls,
    prepare(sql: string) {
      return {
        async get() {
          return record;
        },
        async run() {
          updateCalls.push(sql);
        },
      };
    },
  } as never;
}

describe("email verification", () => {
  it("accepts a valid six-digit code once and activates the user", async () => {
    const now = 1_700_000_000_000;
    const db = fakeDb({ id: "token-1", user_id: "user-1", token_hash: createHash("sha256").update("123456").digest("hex"), expires_at: now + 60_000, used_at: null, attempts: 0, status: "locked" });
    await expect(verifyEmailCode(db, "owner@example.com", "123456", now)).resolves.toEqual({ userId: "user-1" });
    expect(db.updateCalls).toHaveLength(3);
    expect(db.updateCalls.some(sql => sql.includes("used_at"))).toBe(true);
    expect(db.updateCalls.some(sql => sql.includes("status = 'active'"))).toBe(true);
  });

  it("rejects expired and malformed codes without activating", async () => {
    const now = 1_700_000_000_000;
    const db = fakeDb({ id: "token-1", user_id: "user-1", token_hash: createHash("sha256").update("123456").digest("hex"), expires_at: now - 1, used_at: null, attempts: 0, status: "locked" });
    await expect(verifyEmailCode(db, "owner@example.com", "123456", now)).resolves.toEqual({ error: "expired" });
    const malformedDb = fakeDb({ id: "token-1", user_id: "user-1", token_hash: createHash("sha256").update("123456").digest("hex"), expires_at: now + 60_000, used_at: null, attempts: 0, status: "locked" });
    await expect(verifyEmailCode(malformedDb, "owner@example.com", "12x456", now)).resolves.toEqual({ error: "invalid" });
    expect(malformedDb.updateCalls.some(sql => sql.includes("status = 'active'"))).toBe(false);
  });

  it("locks after five failed attempts", async () => {
    const db = fakeDb({ id: "token-1", user_id: "user-1", token_hash: "not-the-code", expires_at: Date.now() + 60_000, used_at: null, attempts: 5, status: "locked" });
    await expect(verifyEmailCode(db, "owner@example.com", "123456")).resolves.toEqual({ error: "locked" });
    expect(db.updateCalls).toHaveLength(0);
  });
});
