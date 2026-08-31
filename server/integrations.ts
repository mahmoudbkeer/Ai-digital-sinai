import { isPostgresUrl } from "./postgres";
import { connect as connectTls } from "node:tls";
import { connect as connectTcp, type Socket } from "node:net";
import { createHmac } from "node:crypto";

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
  createDownloadUrl(input: { tenantId: string; objectKey: string; expiresInSeconds?: number }): Promise<{ status: "READY" | "REQUIRES_SETUP"; url?: string }>;
};

export function resolveObjectStorageProvider(): ObjectStorageProvider {
  const readiness = getIntegrationReadiness();
  const maxBytes = Number(
    process.env.OBJECT_STORAGE_MAX_BYTES ?? 10 * 1024 * 1024
  );
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT?.replace(/\/$/, "");
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  const secret = process.env.OBJECT_STORAGE_SECRET_KEY;
  const scopedKey = (tenantId: string, objectKey: string) => {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(tenantId) || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/.test(objectKey) || objectKey.includes("..")) return null;
    return `${tenantId}/${objectKey}`;
  };
  const signedUrl = (key: string, expiresInSeconds: number) => {
    const expires = Math.floor(Date.now() / 1000) + Math.min(Math.max(expiresInSeconds, 60), 3600);
    const signature = createHmac("sha256", secret ?? "").update(`${bucket}/${key}:${expires}`).digest("hex");
    return `${endpoint}/${bucket}/${key}?expires=${expires}&signature=${signature}`;
  };
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
      const key = scopedKey(input.tenantId, input.objectKey);
      if (!validation.ok || !key || readiness.objectStorage !== "configured")
        return { status: "REQUIRES_SETUP", objectKey: input.objectKey };
      return {
        status: "READY",
        objectKey: key,
        uploadUrl: signedUrl(key, 900),
      };
    },
    async createDownloadUrl(input) {
      const key = scopedKey(input.tenantId, input.objectKey);
      if (!key || readiness.objectStorage !== "configured") return { status: "REQUIRES_SETUP" };
      return { status: "READY", url: signedUrl(key, input.expiresInSeconds ?? 300) };
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
  const redisUrl = process.env.REDIS_URL?.trim();
  const ready = getIntegrationReadiness().redis === "configured";
  const memory = new Map<string, { value: string; expiresAt?: number }>();
  const isExpired = (key: string) => {
    const item = memory.get(key);
    if (item?.expiresAt && item.expiresAt <= Date.now()) memory.delete(key);
    return !memory.has(key);
  };
  async function command(parts: string[]): Promise<string | null> {
    if (!redisUrl) return null;
    const parsed = new URL(redisUrl);
    const tls = parsed.protocol === "rediss:";
    const port = Number(parsed.port || 6379);
    const socket: Socket = tls
      ? (connectTls({ host: parsed.hostname, port, servername: parsed.hostname }) as Socket)
      : connectTcp({ host: parsed.hostname, port });
    const chunks: Buffer[] = [];
    const frame = `*${parts.length}\r\n${parts.map(part => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => { if (!settled) { settled = true; socket.destroy(); callback(); } };
      socket.setTimeout(Number(process.env.REDIS_TIMEOUT_MS ?? 3000));
      socket.on("connect", () => {
        const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
        const database = parsed.pathname.length > 1 ? parsed.pathname.slice(1) : undefined;
        const auth = password ? `*2\r\n$4\r\nAUTH\r\n$${Buffer.byteLength(password)}\r\n${password}\r\n` : "";
        const select = database ? `*2\r\n$6\r\nSELECT\r\n$${Buffer.byteLength(database)}\r\n${database}\r\n` : "";
        socket.write(auth + select + frame);
      });
      socket.on("data", chunk => chunks.push(Buffer.from(chunk)));
      socket.on("end", () => finish(() => {
        const response = Buffer.concat(chunks).toString("utf8").trim();
        const lines = response.split("\r\n");
        const markerIndex = lines.reduce((index, line, current) =>
          /^[+\-:$*]/.test(line) ? current : index, -1);
        const marker = lines[markerIndex] ?? response;
        if (marker.startsWith("-")) reject(new Error("Redis command failed"));
        else if (marker === "$-1") resolve(null);
        else if (marker.startsWith("$")) resolve(lines[markerIndex + 1] ?? null);
        else if (marker.startsWith(":")) resolve(marker.slice(1));
        else resolve(marker.startsWith("+") ? marker.slice(1) : marker);
      }));
      socket.on("timeout", () => finish(() => reject(new Error("Redis timeout"))));
      socket.on("error", error => finish(() => reject(error)));
    });
  }

  return {
    status: ready ? "configured" : "requires_setup",
    async get(key) {
      if (ready) {
        try { return await command(["GET", key]); } catch { return null; }
      }
      if (process.env.NODE_ENV === "production" || redisUrl) return null;
      if (isExpired(key)) return null;
      return memory.get(key)?.value ?? null;
    },
    async set(key, value, ttlSeconds) {
      if (ready) {
        try {
          const result = await command(ttlSeconds ? ["SET", key, value, "EX", String(ttlSeconds)] : ["SET", key, value]);
          return result === "OK" ? "OK" : "REQUIRES_SETUP";
        } catch { return "REQUIRES_SETUP"; }
      }
      if (process.env.NODE_ENV === "production" || redisUrl) return "REQUIRES_SETUP";
      memory.set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      });
      return "OK";
    },
    async del(key) {
      if (ready) {
        try { return Number(await command(["DEL", key])) || 0; } catch { return 0; }
      }
      if (process.env.NODE_ENV === "production" || redisUrl) return 0;
      return memory.delete(key) ? 1 : 0;
    },
  };
}
