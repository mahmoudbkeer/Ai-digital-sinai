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
  if (!process.env.PAYMENT_WEBHOOK_SECRET && environment === "production")
    throw new Error("Production requires PAYMENT_WEBHOOK_SECRET.");
  if (!process.env.CORS_ORIGINS && environment === "production")
    throw new Error("Production requires an explicit CORS_ORIGINS allowlist.");
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
  ping(): Promise<"PONG" | "REQUIRES_SETUP">;
  enqueue(queue: string, payload: string, ttlSeconds?: number): Promise<"QUEUED" | "REQUIRES_SETUP">;
  dequeue(queue: string): Promise<string | null>;
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
    const encode = (commandParts: string[]) =>
      `*${commandParts.length}\r\n${commandParts.map(part => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    const database = parsed.pathname.length > 1 ? parsed.pathname.slice(1) : undefined;
    const frames = [
      ...(password ? [encode(["AUTH", password])] : []),
      ...(database ? [encode(["SELECT", database])] : []),
      encode(parts),
    ];
    const expectedReplies = frames.length;
    type RespValue = { value: string | null; next: number };
    const parse = (buffer: Buffer, offset: number): RespValue | undefined => {
      const marker = String.fromCharCode(buffer[offset] ?? 0);
      const lineEnd = buffer.indexOf("\r\n", offset + 1, "utf8");
      if (lineEnd < 0) return undefined;
      const line = buffer.toString("utf8", offset + 1, lineEnd);
      if (marker === "+" || marker === ":") return { value: line, next: lineEnd + 2 };
      if (marker === "-") throw new Error(`Redis command failed: ${line}`);
      if (marker === "$") {
        const length = Number(line);
        if (length === -1) return { value: null, next: lineEnd + 2 };
        const bodyStart = lineEnd + 2;
        const bodyEnd = bodyStart + length;
        if (buffer.length < bodyEnd + 2) return undefined;
        return { value: buffer.toString("utf8", bodyStart, bodyEnd), next: bodyEnd + 2 };
      }
      throw new Error("Unsupported Redis RESP response");
    };
    return new Promise((resolve, reject) => {
      let settled = false;
      let buffer = Buffer.alloc(0);
      let offset = 0;
      let replies = 0;
      let last: string | null = null;
      const finish = (callback: () => void) => {
        if (!settled) { settled = true; socket.destroy(); callback(); }
      };
      socket.setTimeout(Number(process.env.REDIS_TIMEOUT_MS ?? 3000));
      socket.on("connect", () => socket.write(frames.join("")));
      socket.on("data", chunk => {
        if (settled) return;
        buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
        try {
          while (replies < expectedReplies) {
            const parsedReply = parse(buffer, offset);
            if (!parsedReply) return;
            offset = parsedReply.next;
            replies += 1;
            last = parsedReply.value;
          }
          finish(() => resolve(last));
        } catch (error) {
          finish(() => reject(error));
        }
      });
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
    async ping() {
      if (!ready) return "REQUIRES_SETUP" as const;
      if (!redisUrl) return "PONG" as const;
      try { return (await command(["PING"])) === "PONG" ? "PONG" as const : "REQUIRES_SETUP" as const; } catch { return "REQUIRES_SETUP" as const; }
    },
    async del(key) {
      if (ready) {
        try { return Number(await command(["DEL", key])) || 0; } catch { return 0; }
      }
      if (process.env.NODE_ENV === "production" || redisUrl) return 0;
      return memory.delete(key) ? 1 : 0;
    },
    async enqueue(queue, payload, ttlSeconds) {
      if (!/^[A-Za-z0-9._:-]{1,100}$/.test(queue) || payload.length > 512_000) return "REQUIRES_SETUP";
      if (ready) {
        try {
          const result = await command(["LPUSH", `queue:${queue}`, payload]);
          if (ttlSeconds) await command(["EXPIRE", `queue:${queue}`, String(ttlSeconds)]);
          return result ? "QUEUED" : "REQUIRES_SETUP";
        } catch { return "REQUIRES_SETUP"; }
      }
      if (process.env.NODE_ENV === "production" || redisUrl) return "REQUIRES_SETUP";
      const key = `queue:${queue}`;
      const current = memory.get(key);
      const items = current ? JSON.parse(current.value) as string[] : [];
      items.unshift(payload);
      memory.set(key, { value: JSON.stringify(items), expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : current?.expiresAt });
      return "QUEUED";
    },
    async dequeue(queue) {
      if (!/^[A-Za-z0-9._:-]{1,100}$/.test(queue)) return null;
      if (ready) {
        try { return await command(["RPOP", `queue:${queue}`]); } catch { return null; }
      }
      if (process.env.NODE_ENV === "production" || redisUrl) return null;
      const key = `queue:${queue}`;
      if (isExpired(key)) return null;
      const current = memory.get(key); if (!current) return null;
      const items = JSON.parse(current.value) as string[]; const payload = items.pop() ?? null;
      if (items.length) memory.set(key, { ...current, value: JSON.stringify(items) }); else memory.delete(key);
      return payload;
    },
  };
}
