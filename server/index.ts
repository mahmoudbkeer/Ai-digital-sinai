import express from "express";
import { createServer } from "http";
import { randomUUID } from "node:crypto";
import path from "path";
import { fileURLToPath } from "url";
import { verifyWebhookSignature } from "./payment";
import { isValidCommand } from "./commandPolicy";
import { verifyCommandContext } from "./commandAuth";
import { createSafeErrorLog } from "./observability";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use((req, res, next) => {
    const incoming = req.header("x-request-id");
    const requestId = incoming && /^[A-Za-z0-9._-]{1,100}$/.test(incoming) ? incoming : randomUUID();
    const startedAt = Date.now();
    res.setHeader("X-Request-ID", requestId);
    res.on("finish", () => {
      console.log(JSON.stringify({ event: "http_request", requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt }));
    });
    next();
  });
  const requestWindows = new Map<string, { startedAt: number; count: number }>();
  const allowBurst = (key: string, limit = 30) => {
    const now = Date.now();
    const current = requestWindows.get(key);
    if (!current || now - current.startedAt > 60_000) { requestWindows.set(key, { startedAt: now, count: 1 }); return true; }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  };

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.post("/api/payments/webhook", express.raw({ type: "application/json", limit: "256kb" }), (req, res) => {
    if (!allowBurst(`webhook:${req.ip}`, 20)) return res.status(429).json({ accepted: false, status: "rate-limited" });
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ accepted: false, status: "unconfigured", message: "Payment provider webhook is not configured; no transaction was settled." });
    const signature = req.header("x-payment-signature") ?? "";
    const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    if (!verifyWebhookSignature(payload, signature, secret)) return res.status(403).json({ accepted: false, status: "invalid-signature", verified: false });
    return res.status(202).json({ accepted: true, status: "verified-pending", verified: true, message: "Webhook verified; settlement is intentionally disabled until a provider adapter is configured." });
  });
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https:; form-action 'self'");
    }
    next();
  });
  app.use(express.json({ limit: "128kb" }));
  app.post("/api/commands/prepare", (req, res) => {
    if (!allowBurst(`command:${req.ip}`, 30)) return res.status(429).json({ accepted: false, status: "rate-limited", message: "تم تجاوز عدد المحاولات، أعد المحاولة لاحقاً." });
    const { sectorId, moduleId, operationId } = req.body as { sectorId?: string; moduleId?: string; operationId?: string };
    const valid = isValidCommand({ sectorId, moduleId, operationId });
    if (!valid) return res.status(400).json({ accepted: false, status: "invalid-command", message: "بيانات الأمر غير مكتملة." });
    const userId = req.header("x-command-user");
    const workspaceId = req.header("x-workspace-id");
    const signature = req.header("x-command-context-signature");
    if (!userId || !workspaceId || !signature) return res.status(401).json({ accepted: false, status: "requires-auth", message: "يلزم سياق مستخدم ومساحة عمل مصادق عليهما قبل تجهيز الأمر." });
    const contextSecret = process.env.COMMAND_CONTEXT_SECRET ?? process.env.JWT_SECRET;
    if (!contextSecret) return res.status(503).json({ accepted: false, status: "unconfigured", message: "سياق الأوامر غير مهيأ؛ لم يتم تنفيذ أي معاملة." });
    if (!verifyCommandContext({ userId, workspaceId }, signature, contextSecret)) return res.status(403).json({ accepted: false, status: "invalid-context", message: "سياق المستخدم أو مساحة العمل غير صالح." });
    return res.status(202).json({ accepted: true, status: "verified-pending", sectorId, moduleId, operationId, userId, workspaceId, message: "تم التحقق من سياق الأمر؛ التنفيذ الإنتاجي ما زال متوقفاً حتى ربط العملية وقاعدة البيانات وسجل التدقيق." });
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "ai-digital-sinai-web", timestamp: new Date().toISOString() }));
  app.get("/api/observability", (_req, res) => res.json({ status: "ok", runtime: "node", uptimeSeconds: Math.floor(process.uptime()), version: process.env.npm_package_version ?? "1.0.0" }));
  app.get("/api/app-data", (_req, res) => res.json({
    mode: "app",
    locale: "ar",
    businessData: "not-connected",
    catalogCount: null,
    capabilities: { health: true, paymentWebhookVerification: true, paymentSettlement: false, nativeApk: false },
    roadmap: [
      { id: "data", phase: "01", title: "بيانات الأعمال والصلاحيات", status: "requires-setup", detail: "ربط tRPC وTenant RBAC بقاعدة الإنتاج واختبارات العزل." },
      { id: "payment", phase: "02", title: "الدفع والتسوية", status: "requires-setup", detail: "اعتماد مزود رسمي وإضافة secret ثم تفعيل adapter بعد تحقق webhook." },
      { id: "quality", phase: "03", title: "الجودة والمراقبة", status: "ready", detail: "بوابات check وunit وbrowser smoke موجودة وقابلة للتشغيل." },
      { id: "native", phase: "04", title: "الإصدار Native", status: "deferred", detail: "نقل shell إلى Expo ثم اختبار Android/iOS وإعداد التوقيع." },
    ],
  }));
  app.use(express.static(staticPath));

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 500;
    const requestId = String(res.getHeader("X-Request-ID") ?? "unknown");
    const message = error instanceof Error ? error.message : "Unhandled request error";
    console.error(JSON.stringify(createSafeErrorLog({ requestId, method: req.method, path: req.path, status, error: message })));
    if (res.headersSent) return;
    res.status(status >= 400 && status < 600 ? status : 500).json({ ok: false, error: "internal-error", requestId });
  });

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
