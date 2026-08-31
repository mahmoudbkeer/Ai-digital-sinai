import { isPostgresUrl } from "./postgres";

export type IntegrationStatus = "configured" | "requires_setup" | "blocked";

export type IntegrationReadiness = {
  environment: "development" | "test" | "staging" | "production";
  productionDatabase: IntegrationStatus;
  redis: IntegrationStatus;
  objectStorage: IntegrationStatus;
  payment: IntegrationStatus;
  ai: IntegrationStatus;
  notifications: IntegrationStatus;
  secrets: IntegrationStatus;
};

function runtimeEnvironment(): IntegrationReadiness["environment"] {
  const value = process.env.NODE_ENV;
  if (value === "production" || value === "staging" || value === "test")
    return value;
  return "development";
}

function configured(...values: Array<string | undefined>) {
  return values.every(value => Boolean(value?.trim()));
}

export function getIntegrationReadiness(): IntegrationReadiness {
  return {
    environment: runtimeEnvironment(),
    productionDatabase: isPostgresUrl() ? "configured" : "requires_setup",
    redis: configured(process.env.REDIS_URL) ? "configured" : "requires_setup",
    objectStorage: configured(
      process.env.OBJECT_STORAGE_ENDPOINT,
      process.env.OBJECT_STORAGE_BUCKET,
      process.env.OBJECT_STORAGE_ACCESS_KEY,
      process.env.OBJECT_STORAGE_SECRET_KEY
    )
      ? "configured"
      : "requires_setup",
    payment: configured(
      process.env.PAYMENT_PROVIDER_API_URL,
      process.env.PAYMENT_PROVIDER_API_KEY
    )
      ? "configured"
      : "requires_setup",
    ai: configured(
      process.env.AI_PROVIDER_API_URL,
      process.env.AI_PROVIDER_API_KEY
    )
      ? "configured"
      : "requires_setup",
    notifications: configured(
      process.env.NOTIFICATION_PROVIDER_API_URL,
      process.env.NOTIFICATION_PROVIDER_API_KEY
    )
      ? "configured"
      : "requires_setup",
    secrets: configured(process.env.SECRETS_MANAGER_URL)
      ? "configured"
      : "requires_setup",
  };
}

export function assertRuntimeEnvironment(): void {
  const environment = runtimeEnvironment();
  if (
    environment === "production" &&
    !isPostgresUrl() &&
    process.env.ALLOW_SQLITE_PRODUCTION_TEST !== "1"
  )
    throw new Error(
      "Production requires DATABASE_URL PostgreSQL; SQLite is allowed only for explicit tests."
    );
  if (!process.env.COMMAND_CONTEXT_SECRET && environment === "production")
    throw new Error("Production requires COMMAND_CONTEXT_SECRET.");
}

export type ObjectStorageProvider = {
  status: IntegrationStatus;
  validateUpload(input: {
    contentType: string;
    sizeBytes: number;
    allowedTypes?: string[];
    maxBytes?: number;
  }): { ok: true } | { ok: false; code: string };
  createUploadIntent(input: {
    tenantId: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<{
    status: "READY" | "REQUIRES_SETUP";
    objectKey?: string;
    uploadUrl?: string;
  }>;
};

export function resolveObjectStorageProvider(): ObjectStorageProvider {
  const readiness = getIntegrationReadiness();
  const maxBytes = Number(
    process.env.OBJECT_STORAGE_MAX_BYTES ?? 10 * 1024 * 1024
  );
  return {
    status: readiness.objectStorage,
    validateUpload(input) {
      if (
        !/^[-\w.+/]+$/.test(input.contentType) ||
        input.sizeBytes < 0 ||
        input.sizeBytes > (input.maxBytes ?? maxBytes)
      )
        return { ok: false, code: "invalid-file" };
      if (input.allowedTypes && !input.allowedTypes.includes(input.contentType))
        return { ok: false, code: "file-type-not-allowed" };
      return { ok: true };
    },
    async createUploadIntent(input) {
      const validation = this.validateUpload({ ...input });
      if (!validation.ok || readiness.objectStorage !== "configured")
        return { status: "REQUIRES_SETUP", objectKey: input.objectKey };
      return {
        status: "READY",
        objectKey: `${input.tenantId}/${input.objectKey}`,
        uploadUrl: undefined,
      };
    },
  };
}

export type RedisProvider = {
  status: IntegrationStatus;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    ttlSeconds?: number
  ): Promise<"OK" | "REQUIRES_SETUP">;
  del(key: string): Promise<number>;
};

export function resolveRedisProvider(): RedisProvider {
  const ready = getIntegrationReadiness().redis === "configured";
  const memory = new Map<string, { value: string; expiresAt?: number }>();
  const isExpired = (key: string) => {
    const item = memory.get(key);
    if (item?.expiresAt && item.expiresAt <= Date.now()) memory.delete(key);
    return !memory.has(key);
  };
  return {
    status: ready ? "configured" : "requires_setup",
    async get(key) {
      if (process.env.NODE_ENV === "production" && !ready) return null;
      if (isExpired(key)) return null;
      return memory.get(key)?.value ?? null;
    },
    async set(key, value, ttlSeconds) {
      if (process.env.NODE_ENV === "production" && !ready)
        return "REQUIRES_SETUP";
      memory.set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      });
      return "OK";
    },
    async del(key) {
      if (process.env.NODE_ENV === "production" && !ready) return 0;
      return memory.delete(key) ? 1 : 0;
    },
  };
}
