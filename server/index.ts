import express from "express";
import { createServer } from "http";
import { createHash, randomUUID } from "node:crypto";
import path from "path";
import { fileURLToPath } from "url";
import { verifyWebhookSignature } from "./payment";
import { isValidCommand } from "./commandPolicy";
import { verifyCommandContext } from "./commandAuth";
import { createSafeErrorLog } from "./observability";
import {
  getDataPlane,
  ensureDataPlaneReady,
  withDataPlaneTransaction,
} from "./dataPlane";
import { createPlatformRouter, platformErrorHandler } from "./platform";
import { checkPostgres, isPostgresUrl } from "./postgres";
import {
  assertRuntimeEnvironment,
  getIntegrationReadiness,
  resolveRedisProvider,
} from "./integrations";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  assertRuntimeEnvironment();
  await ensureDataPlaneReady();
  const app = express();
  const server = createServer(app);
  app.use((req, res, next) => {
    const incoming = req.header("x-request-id");
    const requestId =
      incoming && /^[A-Za-z0-9._-]{1,100}$/.test(incoming)
        ? incoming
        : randomUUID();
    const startedAt = Date.now();
    res.setHeader("X-Request-ID", requestId);
    res.on("finish", () => {
      console.log(
        JSON.stringify({
          event: "http_request",
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - startedAt,
        })
      );
    });
    next();
  });
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(self)"
    );
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
      );
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https:; form-action 'self'"
      );
    }
    const origin = req.header("origin");
    const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Idempotency-Key, X-Tenant-Id, X-Request-Id"
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,PUT,DELETE,OPTIONS"
      );
    }
    if (req.method === "OPTIONS")
      return res.sendStatus(
        origin && allowedOrigins.includes(origin) ? 204 : 403
      );
    next();
  });
  const requestWindows = new Map<
    string,
    { startedAt: number; count: number }
  >();
  const commandIdempotency = new Map<
    string,
    {
      fingerprint: string;
      response: Record<string, unknown>;
      expiresAt: number;
    }
  >();
  const allowBurst = (key: string, limit = 30) => {
    const now = Date.now();
    const current = requestWindows.get(key);
    if (!current || now - current.startedAt > 60_000) {
      requestWindows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  };

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json", limit: "256kb" }),
    async (req, res) => {
      if (!allowBurst(`webhook:${req.ip}`, 20))
        return res
          .status(429)
          .json({ accepted: false, status: "rate-limited" });
      const secret = process.env.PAYMENT_WEBHOOK_SECRET;
      if (!secret)
        return res.status(503).json({
          accepted: false,
          status: "unconfigured",
          message:
            "Payment provider webhook is not configured; no transaction was settled.",
        });
      const signature = req.header("x-payment-signature") ?? "";
      const provider = (req.header("x-payment-provider") ?? "unknown")
        .trim()
        .toLowerCase();
      const payload = Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : "";
      if (!verifyWebhookSignature(payload, signature, secret))
        return res.status(403).json({
          accepted: false,
          status: "invalid-signature",
          verified: false,
        });
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        return res.status(400).json({
          accepted: false,
          status: "invalid-payload",
          verified: false,
        });
      }
      const eventId =
        typeof parsed.eventId === "string"
          ? parsed.eventId
          : typeof parsed.event_id === "string"
            ? parsed.event_id
            : typeof parsed.id === "string"
              ? parsed.id
            : req.header("x-payment-event-id");
      if (!eventId || !/^[A-Za-z0-9._:-]{3,200}$/.test(eventId))
        return res.status(400).json({
          accepted: false,
          status: "missing-event-id",
          verified: true,
        });
      const db = getDataPlane();
      const payloadHash = createHash("sha256").update(payload).digest("hex");
      const signatureHash = createHash("sha256")
        .update(signature)
        .digest("hex");
      const previous = (await db
        .prepare(
          "SELECT payload_hash, status FROM payment_webhook_events WHERE provider = ? AND event_id = ?"
        )
        .get(provider, eventId)) as
        | { payload_hash: string; status: string }
        | undefined;
      if (previous) {
        if (previous.payload_hash !== payloadHash)
          return res.status(409).json({
            accepted: false,
            status: "webhook-replay-conflict",
            verified: true,
          });
        return res.status(200).json({
          accepted: true,
          status: previous.status.toLowerCase().replaceAll("_", "-"),
          verified: true,
          duplicate: true,
          message: "تمت معالجة هذا الحدث سابقاً؛ لم تتم إعادة التسوية.",
        });
      }
      const providerReference = ["providerReference", "provider_reference", "paymentIntentId", "payment_intent_id"]
        .map(key => parsed[key]).find(value => typeof value === "string") as string | undefined;
      const rawEvent = [parsed.event, parsed.type, parsed.status].find(value => typeof value === "string");
      const event = typeof rawEvent === "string" ? rawEvent.toLowerCase() : "";
      const nextPaymentStatus = /refund/.test(event) ? "REFUNDED" : /fail|declin|cancel/.test(event) ? "FAILED" : /captur|success|paid|authoriz/.test(event) ? "CAPTURED" : null;
      const settled = await withDataPlaneTransaction(db, async () => {
        const intent = providerReference
          ? (await db.prepare("SELECT id, tenant_id, order_id, status FROM payment_intents WHERE provider = ? AND provider_reference = ?").get(provider, providerReference) as { id: string; tenant_id: string; order_id: string | null; status: string } | undefined)
          : undefined;
        const eventStatus = intent && nextPaymentStatus ? nextPaymentStatus : "VERIFIED_PENDING";
        await db.prepare("INSERT INTO payment_webhook_events (id, provider, event_id, payload_hash, signature_hash, status, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), provider, eventId, payloadHash, signatureHash, eventStatus, Date.now());
        if (!intent || !nextPaymentStatus) return { status: "VERIFIED_PENDING", intentId: null, tenantId: null, orderId: null };
        await db.prepare("UPDATE payment_intents SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND status NOT IN ('REFUNDED','CAPTURED')").run(nextPaymentStatus, Date.now(), intent.id, intent.tenant_id);
        if (intent.order_id && nextPaymentStatus === "CAPTURED") {
          await db.prepare("UPDATE orders SET state = 'CONFIRMED', updated_at = ? WHERE id = ? AND tenant_id = ? AND state IN ('PENDING','CONFIRMED')").run(Date.now(), intent.order_id, intent.tenant_id);
          await db.prepare("UPDATE invoices SET status = 'PAID' WHERE order_id = ? AND tenant_id = ? AND status IN ('DRAFT','ISSUED')").run(intent.order_id, intent.tenant_id);
        }
        await db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_user_id, action, resource_type, resource_id, request_id, metadata_json, created_at) VALUES (?, ?, NULL, ?, 'payment_intent', ?, ?, ?, ?)").run(randomUUID(), intent.tenant_id, `payment.${nextPaymentStatus.toLowerCase()}`, intent.id, req.header("x-request-id"), JSON.stringify({ provider, providerReference, eventId }), Date.now());
        return { status: nextPaymentStatus, intentId: intent.id, tenantId: intent.tenant_id, orderId: intent.order_id };
      });
      return res.status(settled.status === "VERIFIED_PENDING" ? 202 : 200).json({
        accepted: true,
        status: settled.status.toLowerCase().replaceAll("_", "-"),
        verified: true,
        eventId,
        paymentIntentId: settled.intentId,
        orderId: settled.orderId,
        message: settled.status === "VERIFIED_PENDING" ? "تم التحقق من Webhook وتسجيله؛ لم يوجد payment intent قابل للتسوية." : "تم التحقق من Webhook وتحديث حالة الدفع والطلب والفاتورة.",
      });
    }
  );
  app.use(express.json({ limit: "128kb" }));
  app.use("/api/platform", createPlatformRouter());
  app.use(platformErrorHandler);
  app.post("/api/commands/prepare", (req, res) => {
    if (!allowBurst(`command:${req.ip}`, 30))
      return res.status(429).json({
        accepted: false,
        status: "rate-limited",
        message: "تم تجاوز عدد المحاولات، أعد المحاولة لاحقاً.",
      });
    const { sectorId, moduleId, operationId } = req.body as {
      sectorId?: string;
      moduleId?: string;
      operationId?: string;
    };
    const valid = isValidCommand({ sectorId, moduleId, operationId });
    if (!valid)
      return res.status(400).json({
        accepted: false,
        status: "invalid-command",
        message: "بيانات الأمر غير مكتملة.",
      });
    const userId = req.header("x-command-user");
    const workspaceId = req.header("x-workspace-id");
    const signature = req.header("x-command-context-signature");
    if (!userId || !workspaceId || !signature)
      return res.status(401).json({
        accepted: false,
        status: "requires-auth",
        message: "يلزم سياق مستخدم ومساحة عمل مصادق عليهما قبل تجهيز الأمر.",
      });
    const contextSecret =
      process.env.COMMAND_CONTEXT_SECRET ?? process.env.JWT_SECRET;
    if (!contextSecret)
      return res.status(503).json({
        accepted: false,
        status: "unconfigured",
        message: "سياق الأوامر غير مهيأ؛ لم يتم تنفيذ أي معاملة.",
      });
    if (
      !verifyCommandContext({ userId, workspaceId }, signature, contextSecret)
    )
      return res.status(403).json({
        accepted: false,
        status: "invalid-context",
        message: "سياق المستخدم أو مساحة العمل غير صالح.",
      });
    const idempotencyKey = req.header("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey))
      return res.status(428).json({
        accepted: false,
        status: "requires-idempotency-key",
        message: "يلزم مفتاح Idempotency صالح قبل تجهيز أمر حساس.",
      });
    const fingerprint = [
      userId,
      workspaceId,
      sectorId,
      moduleId,
      operationId,
    ].join("|");
    const previous = commandIdempotency.get(idempotencyKey);
    if (previous && previous.expiresAt > Date.now()) {
      if (previous.fingerprint !== fingerprint)
        return res.status(409).json({
          accepted: false,
          status: "idempotency-conflict",
          message: "مفتاح Idempotency مستخدم مع سياق أو أمر مختلف.",
        });
      return res.status(200).json(previous.response);
    }
    const response = {
      accepted: true,
      status: "verified-pending",
      sectorId,
      moduleId,
      operationId,
      userId,
      workspaceId,
      message:
        "تم التحقق من سياق الأمر؛ التنفيذ الإنتاجي ما زال متوقفاً حتى ربط العملية وقاعدة البيانات وسجل التدقيق.",
    };
    commandIdempotency.set(idempotencyKey, {
      fingerprint,
      response,
      expiresAt: Date.now() + 10 * 60_000,
    });
    return res.status(202).json(response);
  });
  app.get("/api/health", async (_req, res) => {
    let database = false;
    try { getDataPlane(); database = true; } catch {}
    const redisConfigured = Boolean(process.env.REDIS_URL?.trim());
    const redis = redisConfigured ? await resolveRedisProvider().ping() : "LOCAL_MEMORY";
    const ok = database && (!redisConfigured || redis === "PONG");
    res.status(ok ? 200 : 503).json({ ok, service: "ai-digital-sinai-web", timestamp: new Date().toISOString(), checks: { database, redis } });
  });
  app.get("/api/readiness", async (_req, res) => {
    const postgresConfigured = isPostgresUrl();
    let database = false;
    let databaseProvider: "sqlite" | "postgresql" = postgresConfigured
      ? "postgresql"
      : "sqlite";
    let databaseDetail: unknown = undefined;
    if (postgresConfigured) {
      const result = await checkPostgres();
      database = result.ok;
      databaseDetail = result;
    } else {
      try {
        getDataPlane();
        database = true;
      } catch (error) {
        databaseDetail =
          error instanceof Error ? error.message : "sqlite unavailable";
      }
    }
    const redisConfigured = Boolean(process.env.REDIS_URL?.trim());
    const redis = redisConfigured ? await resolveRedisProvider().ping() : "LOCAL_MEMORY";
    const checks = {
      commandContext: Boolean(
        process.env.COMMAND_CONTEXT_SECRET ?? process.env.JWT_SECRET
      ),
      paymentWebhook: Boolean(process.env.PAYMENT_WEBHOOK_SECRET),
      database,
      redis: !redisConfigured || redis === "PONG",
      businessDataPlane: database,
      productionDatabase:
        process.env.NODE_ENV === "production" ? postgresConfigured : true,
    };
    const ready = Object.values(checks).every(Boolean);
    return res.status(ready ? 200 : 503).json({
      ok: ready,
      status: ready ? "ready" : "degraded",
      databaseProvider,
      databaseDetail,
      checks,
      runtime: { redis },
      integrations: getIntegrationReadiness(),
      message: ready
        ? "الخدمات الأساسية مهيأة."
        : "الخدمات الأساسية غير مهيأة بالكامل؛ لم يتم تفعيل أي معاملة تلقائياً.",
    });
  });
  app.get("/api/observability", (_req, res) =>
    res.json({
      status: "ok",
      runtime: "node",
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? "1.0.0",
    })
  );
  app.get("/api/app-data", (_req, res) =>
    res.json({
      mode: "app",
      locale: "ar",
      businessData: "not-connected",
      catalogCount: null,
      capabilities: {
        health: true,
        platformCore: true,
        tenantIsolation: true,
        inventory: true,
        orders: true,
        ledger: true,
        paymentWebhookVerification: true,
        paymentSettlement: false,
        aiProvider: Boolean(process.env.AI_PROVIDER_API_KEY),
        nativeApk: false,
      },
      roadmap: [
        {
          id: "data",
          phase: "01",
          title: "بيانات الأعمال والصلاحيات",
          status: "ready",
          detail:
            "SQLite مع علاقات وفهارس ومعاملات، وهوية وجلسات وTenant RBAC/ABAC وتدقيق خادمي.",
        },
        {
          id: "payment",
          phase: "02",
          title: "الدفع والتسوية",
          status: process.env.PAYMENT_PROVIDER_API_KEY
            ? "requires-setup"
            : "blocked-external-dependency",
          detail:
            "Payment Intent وIdempotency موجودان؛ يلزم مزود رسمي وبيانات اعتماد قبل أي تفويض أو تسوية.",
        },
        {
          id: "quality",
          phase: "03",
          title: "الجودة والمراقبة",
          status: "ready",
          detail: "بوابات check وunit وbrowser smoke موجودة وقابلة للتشغيل.",
        },
        {
          id: "native",
          phase: "04",
          title: "الإصدار Native",
          status: "deferred",
          detail: "نقل shell إلى Expo ثم اختبار Android/iOS وإعداد التوقيع.",
        },
      ],
    })
  );
  app.use(express.static(staticPath));

  app.use(
    (
      error: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const status =
        typeof error === "object" &&
        error &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : 500;
      const requestId = String(res.getHeader("X-Request-ID") ?? "unknown");
      const message =
        error instanceof Error ? error.message : "Unhandled request error";
      console.error(
        JSON.stringify(
          createSafeErrorLog({
            requestId,
            method: req.method,
            path: req.path,
            status,
            error: message,
          })
        )
      );
      if (res.headersSent) return;
      res
        .status(status >= 400 && status < 600 ? status : 500)
        .json({ ok: false, error: "internal-error", requestId });
    }
  );

  // Handle client-side routing - serve index.html for all routes
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
