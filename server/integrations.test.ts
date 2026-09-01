import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertRuntimeEnvironment,
  getIntegrationReadiness,
  resolveObjectStorageProvider,
  resolveRedisProvider,
} from "./integrations";
import { resolveAIProvider } from "./aiProviders";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runtime integration contracts", () => {
  it("requires PostgreSQL and a command secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COMMAND_CONTEXT_SECRET", "production-test-secret");
    vi.stubEnv("DATABASE_URL", "");
    expect(() => assertRuntimeEnvironment()).toThrow(/PostgreSQL/);
  });

  it("allows SQLite only through an explicit test bypass", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COMMAND_CONTEXT_SECRET", "production-test-secret");
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", "production-webhook-secret");
    vi.stubEnv("CORS_ORIGINS", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ALLOW_SQLITE_PRODUCTION_TEST", "1");
    expect(() => assertRuntimeEnvironment()).not.toThrow();
  });

  it("validates uploads before an object-storage provider is configured", () => {
    vi.stubEnv("NODE_ENV", "test");
    const storage = resolveObjectStorageProvider();
    expect(
      storage.validateUpload({
        contentType: "image/png",
        sizeBytes: 100,
        allowedTypes: ["image/png"],
      })
    ).toEqual({ ok: true });
    expect(
      storage.validateUpload({
        contentType: "application/x-sh",
        sizeBytes: 100,
        allowedTypes: ["image/png"],
      })
    ).toMatchObject({ ok: false });
    expect(
      storage.validateUpload({
        contentType: "image/png",
        sizeBytes: 11,
        maxBytes: 10,
      })
    ).toMatchObject({ ok: false });
  });

  it("keeps Redis memory fallback out of production when not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    const redis = resolveRedisProvider();
    expect(redis.status).toBe("requires_setup");
    expect(await redis.set("key", "value")).toBe("REQUIRES_SETUP");
  });

  it("does not silently use process memory when Redis is configured but unreachable", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1/0");
    const redis = resolveRedisProvider();
    expect(redis.status).toBe("configured");
    expect(await redis.set("key", "value")).toBe("REQUIRES_SETUP");
    expect(await redis.get("key")).toBeNull();
  });

  it("creates tenant-scoped signed storage URLs and rejects traversal", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("OBJECT_STORAGE_ENDPOINT", "https://objects.example.test");
    vi.stubEnv("OBJECT_STORAGE_BUCKET", "sinai");
    vi.stubEnv("OBJECT_STORAGE_ACCESS_KEY", "access");
    vi.stubEnv("OBJECT_STORAGE_SECRET_KEY", "secret");
    const storage = resolveObjectStorageProvider();
    await expect(storage.createUploadIntent({ tenantId: "tenant-a", objectKey: "docs/file.pdf", contentType: "application/pdf", sizeBytes: 100 })).resolves.toMatchObject({ status: "READY", objectKey: "tenant-a/docs/file.pdf", uploadUrl: expect.stringContaining("signature=") });
    await expect(storage.createDownloadUrl({ tenantId: "tenant-a", objectKey: "../tenant-b/private.pdf" })).resolves.toMatchObject({ status: "REQUIRES_SETUP" });
  });

  it("reports unconfigured AI gateway without fabricating a result", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "");
    vi.stubEnv("AI_PROVIDER_API_URL", "");
    const provider = resolveAIProvider();
    expect(provider.status).toBe("requires_setup");
    await expect(
      provider.complete({
        purpose: "test",
        prompt: "hello",
        tenantId: "tenant-a",
        allowedDataScope: ["orders"],
      })
    ).resolves.toMatchObject({ status: "REQUIRES_SETUP" });
  });

  it("exposes environment and external dependency readiness", () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/db");
    const readiness = getIntegrationReadiness();
    expect(readiness).toMatchObject({
      environment: "staging",
      productionDatabase: "configured",
      redis: "requires_setup",
      objectStorage: "requires_setup",
    });
  });

  it("requires explicit production webhook secret and CORS allowlist", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/db");
    vi.stubEnv("COMMAND_CONTEXT_SECRET", "production-test-secret");
    expect(() => assertRuntimeEnvironment()).toThrow(/PAYMENT_WEBHOOK_SECRET/);
  });
});
