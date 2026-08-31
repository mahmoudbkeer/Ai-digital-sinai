import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { getDatabase, withTransaction, type AppDatabase } from "./database";
import { resolvePaymentProvider } from "./paymentProviders";
import { resolveNotificationProvider, type NotificationChannel } from "./notificationProviders";

export const ROLES = [
  "SUPER_ADMIN", "PLATFORM_ADMIN", "TENANT_OWNER", "TENANT_ADMIN", "MANAGER", "ACCOUNTANT", "SALES",
  "INVENTORY_MANAGER", "HR", "MARKETING", "EMPLOYEE", "SERVICE_PROVIDER", "DRIVER", "CUSTOMER",
] as const;
export type Role = (typeof ROLES)[number];
export type Permission = `${string}.${"create" | "read" | "update" | "delete" | "approve" | "publish" | "refund" | "manage" | "export"}`;

const ALL: Permission[] = [
  "tenant.read", "tenant.manage", "business.read", "business.manage", "branch.read", "branch.manage",
  "employee.read", "employee.manage", "customer.read", "customer.manage", "product.read", "product.manage",
  "inventory.read", "inventory.manage", "order.read", "order.manage", "order.approve", "order.refund",
  "ledger.read", "ledger.manage", "payment.read", "payment.manage", "payment.refund", "invoice.read", "invoice.manage", "subscription.read",
  "subscription.manage", "ai.read", "ai.manage", "notification.read", "notification.manage", "advertising.read", "advertising.manage", "audit.read",
  "admin.manage",
];
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,
  PLATFORM_ADMIN: ALL.filter((permission) => permission !== "payment.refund"),
  TENANT_OWNER: ALL.filter((permission) => !permission.startsWith("admin.")),
  TENANT_ADMIN: ALL.filter((permission) => !permission.startsWith("admin.") && !permission.startsWith("subscription.")),
  MANAGER: ["tenant.read", "business.read", "branch.read", "employee.read", "customer.read", "customer.manage", "product.read", "product.manage", "inventory.read", "inventory.manage", "order.read", "order.manage", "order.approve", "ledger.read", "payment.read", "ai.read", "notification.read", "notification.manage", "audit.read"],
  ACCOUNTANT: ["tenant.read", "business.read", "branch.read", "customer.read", "order.read", "ledger.read", "ledger.manage", "payment.read", "payment.manage", "invoice.read", "invoice.manage", "order.refund", "subscription.read", "audit.read"],
  SALES: ["tenant.read", "business.read", "branch.read", "customer.read", "customer.manage", "product.read", "order.read", "order.manage", "payment.read", "ai.read"],
  INVENTORY_MANAGER: ["tenant.read", "business.read", "branch.read", "product.read", "product.manage", "inventory.read", "inventory.manage", "supplier.read", "order.read", "audit.read"],
  HR: ["tenant.read", "business.read", "branch.read", "employee.read", "employee.manage", "audit.read"],
  MARKETING: ["tenant.read", "business.read", "product.read", "customer.read", "order.read", "ai.read", "ai.manage", "advertising.read", "advertising.manage", "notification.read", "notification.manage"],
  EMPLOYEE: ["tenant.read", "business.read", "branch.read", "product.read", "inventory.read", "order.read", "order.manage", "customer.read", "ai.read"],
  SERVICE_PROVIDER: ["tenant.read", "business.read", "order.read", "order.manage", "customer.read", "ai.read"],
  DRIVER: ["tenant.read", "order.read", "order.update"],
  CUSTOMER: ["tenant.read", "product.read", "order.read", "order.manage", "payment.read", "ai.read"],
};

export type TenantContext = {
  userId: string;
  tenantId: string;
  role: Role;
  permissions: Permission[];
  businessId?: string;
  branchId?: string;
};

type AuthenticatedRequest = Request & { tenantContext?: TenantContext; requestId?: string };

function now() { return Date.now(); }
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function isNonEmptyString(value: unknown, max = 200): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function json(value: unknown) { return JSON.stringify(value); }
function parseJson<T>(value: unknown, fallback: T): T { try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function httpError(status: number, code: string, message: string) { const error = new Error(message) as Error & { status?: number; code?: string }; error.status = status; error.code = code; return error; }
function hasPermission(context: TenantContext, permission: Permission) { return context.role === "SUPER_ADMIN" || context.permissions.includes(permission); }
function assertScope(context: TenantContext, tenantId: string, permission: Permission) {
  if (context.tenantId !== tenantId && context.role !== "SUPER_ADMIN" && context.role !== "PLATFORM_ADMIN") throw httpError(403, "tenant-isolation", "لا يمكن الوصول إلى بيانات مستأجر آخر.");
  if (!hasPermission(context, permission)) throw httpError(403, "forbidden", "لا تملك الصلاحية المطلوبة.");
}
function recordAudit(db: AppDatabase, context: Partial<TenantContext>, action: string, resourceType: string, resourceId: string | null, requestId: string | undefined, metadata: Record<string, unknown> = {}) {
  db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_user_id, action, resource_type, resource_id, request_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), context.tenantId ?? null, context.userId ?? null, action, resourceType, resourceId, requestId ?? null, json(metadata), now());
}

function postBalancedSaleJournal(db: AppDatabase, context: TenantContext, orderId: string, totalCents: number, requestId: string | undefined) {
  const accounts = db.prepare("SELECT id, code FROM ledger_accounts WHERE tenant_id = ? AND code IN ('1200', '4000')").all(context.tenantId) as Array<{ id: string; code: string }>;
  const receivable = accounts.find((account) => account.code === "1200"); const revenue = accounts.find((account) => account.code === "4000");
  if (!receivable || !revenue) throw httpError(503, "ledger-not-configured", "حسابات دفتر الأستاذ غير مهيأة لهذا المستأجر.");
  const journalId = randomUUID(); const timestamp = now();
  db.prepare("INSERT INTO ledger_journals (id, tenant_id, reference_type, reference_id, memo, idempotency_key, created_by, created_at) VALUES (?, ?, 'ORDER_SALE', ?, ?, ?, ?, ?)").run(journalId, context.tenantId, orderId, `Sale ${orderId}`, `order-sale:${orderId}`, context.userId, timestamp);
  const entryInsert = db.prepare("INSERT INTO ledger_entries (id, journal_id, tenant_id, account_id, line_no, debit_cents, credit_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  entryInsert.run(randomUUID(), journalId, context.tenantId, receivable.id, 1, totalCents, 0, timestamp);
  entryInsert.run(randomUUID(), journalId, context.tenantId, revenue.id, 2, 0, totalCents, timestamp);
  recordAudit(db, context, "ledger.sale.post", "ledger_journal", journalId, requestId, { orderId, debitCents: totalCents, creditCents: totalCents });
  return journalId;
}

function issueInvoice(db: AppDatabase, context: TenantContext, order: { id: string; subtotal_cents: number; tax_cents: number; total_cents: number; currency: string }, requestId: string | undefined) {
  const existing = db.prepare("SELECT id, invoice_number, status FROM invoices WHERE tenant_id = ? AND order_id = ?").get(context.tenantId, order.id) as { id: string; invoice_number: string; status: string } | undefined;
  if (existing) return existing;
  const invoiceId = randomUUID(); const invoiceNumber = `INV-${new Date().getUTCFullYear()}-${invoiceId.slice(0, 8).toUpperCase()}`;
  db.prepare("INSERT INTO invoices (id, tenant_id, order_id, invoice_number, subtotal_cents, tax_cents, total_cents, currency, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(invoiceId, context.tenantId, order.id, invoiceNumber, order.subtotal_cents, order.tax_cents, order.total_cents, order.currency, now());
  recordAudit(db, context, "invoice.issue", "invoice", invoiceId, requestId, { orderId: order.id, totalCents: order.total_cents });
  return { id: invoiceId, invoice_number: invoiceNumber, status: "ISSUED" };
}

function postBalancedCancellationJournal(db: AppDatabase, context: TenantContext, orderId: string, totalCents: number, requestId: string | undefined) {
  const accounts = db.prepare("SELECT id, code FROM ledger_accounts WHERE tenant_id = ? AND code IN ('1200', '4000')").all(context.tenantId) as Array<{ id: string; code: string }>;
  const receivable = accounts.find((account) => account.code === "1200"); const revenue = accounts.find((account) => account.code === "4000"); if (!receivable || !revenue) throw httpError(503, "ledger-not-configured", "حسابات دفتر الأستاذ غير مهيأة لهذا المستأجر.");
  const journalId = randomUUID(); const timestamp = now(); db.prepare("INSERT INTO ledger_journals (id, tenant_id, reference_type, reference_id, memo, idempotency_key, created_by, created_at) VALUES (?, ?, 'ORDER_CANCELLATION', ?, ?, ?, ?, ?)").run(journalId, context.tenantId, orderId, `Cancellation ${orderId}`, `order-cancellation:${orderId}`, context.userId, timestamp);
  const entryInsert = db.prepare("INSERT INTO ledger_entries (id, journal_id, tenant_id, account_id, line_no, debit_cents, credit_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"); entryInsert.run(randomUUID(), journalId, context.tenantId, revenue.id, 1, totalCents, 0, timestamp); entryInsert.run(randomUUID(), journalId, context.tenantId, receivable.id, 2, 0, totalCents, timestamp);
  recordAudit(db, context, "ledger.cancellation.post", "ledger_journal", journalId, requestId, { orderId, debitCents: totalCents, creditCents: totalCents }); return journalId;
}

function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password: string, encoded: string | null | undefined) {
  if (!encoded?.startsWith("scrypt$")) return false;
  const [, salt, expectedHex] = encoded.split("$");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
function createSession(db: AppDatabase, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = now();
  db.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), userId, hashToken(token), createdAt + 30 * 24 * 60 * 60 * 1000, createdAt);
  return token;
}

function currentContext(req: AuthenticatedRequest): TenantContext {
  if (!req.tenantContext) throw httpError(401, "requires-auth", "يلزم تسجيل الدخول وسياق مستأجر صالح.");
  return req.tenantContext;
}

function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const authorization = req.header("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : req.header("x-session-token");
    if (!token) throw httpError(401, "requires-auth", "يلزم رمز جلسة مصادق عليه.");
    const db = getDatabase();
    const session = db.prepare("SELECT s.user_id, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?").get(hashToken(token), now()) as { user_id: string; status: string } | undefined;
    if (!session || session.status !== "active") throw httpError(401, "invalid-session", "الجلسة غير صالحة أو منتهية.");
    const tenantId = req.header("x-tenant-id");
    if (!tenantId || !/^[A-Za-z0-9_-]{8,100}$/.test(tenantId)) throw httpError(400, "requires-tenant", "يلزم تحديد مستأجر صالح.");
    const member = db.prepare("SELECT role, permissions_json FROM tenant_members WHERE tenant_id = ? AND user_id = ?").get(tenantId, session.user_id) as { role: Role; permissions_json: string } | undefined;
    if (!member) throw httpError(403, "tenant-isolation", "المستخدم ليس عضواً في هذا المستأجر.");
    const rolePermissions = ROLE_PERMISSIONS[member.role] ?? [];
    const explicit = parseJson<Permission[]>(member.permissions_json, []);
    req.tenantContext = { userId: session.user_id, tenantId, role: member.role, permissions: Array.from(new Set([...rolePermissions, ...explicit])), businessId: req.header("x-business-id") ?? undefined, branchId: req.header("x-branch-id") ?? undefined };
    next();
  } catch (error) { next(error); }
}

function validateMoney(value: unknown, name: string) {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 2_000_000_000) throw httpError(400, "invalid-money", `${name} يجب أن يكون مبلغاً صحيحاً موجباً بوحدة السنتات.`);
  return value as number;
}
function validatePositiveInteger(value: unknown, name: string) {
  if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > 1_000_000) throw httpError(400, "invalid-number", `${name} يجب أن يكون عدداً صحيحاً موجباً.`);
  return value as number;
}
function coordinate(value: unknown, name: string, min: number, max: number) { const number = typeof value === "number" ? value : Number(value); if (!Number.isFinite(number) || number < min || number > max) throw httpError(400, "invalid-coordinate", `${name} خارج النطاق.`); return number; }
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) { const radians = (degree: number) => degree * Math.PI / 180; const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
const ORDER_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["PROCESSING", "CANCELLED"], PROCESSING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"], OUT_FOR_DELIVERY: ["COMPLETED"], COMPLETED: [],
  CANCELLED: [], REFUNDED: [],
};

export function createPlatformRouter(): Router {
  const router = Router();
  const authWindows = new Map<string, { startedAt: number; count: number }>();
  const allowAuthBurst = (key: string, limit = 10) => { const timestamp = now(); const current = authWindows.get(key); if (!current || timestamp - current.startedAt > 60_000) { authWindows.set(key, { startedAt: timestamp, count: 1 }); return true; } if (current.count >= limit) return false; current.count += 1; return true; };

  router.post("/auth/register", (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email ?? "");
      const password = req.body?.password;
      const displayName = req.body?.displayName;
      const tenantName = req.body?.tenantName;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 12 || !isNonEmptyString(displayName, 120) || !isNonEmptyString(tenantName, 120)) throw httpError(400, "invalid-registration", "البريد وكلمة المرور (12 حرفاً على الأقل) واسم المستخدم والمستأجر مطلوبة.");
      const db = getDatabase();
      const result = withTransaction(db, () => {
        const userId = randomUUID();
        const tenantId = randomUUID();
        const createdAt = now();
        const slug = `${tenantName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tenant"}-${randomBytes(3).toString("hex")}`;
        db.prepare("INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(userId, email, displayName.trim(), passwordHash(password), createdAt, createdAt);
        db.prepare("INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(tenantId, tenantName.trim(), slug, createdAt, createdAt);
        db.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, permissions_json, created_at) VALUES (?, ?, 'TENANT_OWNER', '[]', ?)").run(tenantId, userId, createdAt);
        db.prepare("INSERT INTO user_security (user_id, updated_at) VALUES (?, ?)").run(userId, createdAt);
        const businessId = randomUUID();
        const branchId = randomUUID();
        db.prepare("INSERT INTO businesses (id, tenant_id, name, category, created_at, updated_at) VALUES (?, ?, ?, 'general', ?, ?)").run(businessId, tenantId, tenantName.trim(), createdAt, createdAt);
        db.prepare("INSERT INTO branches (id, tenant_id, business_id, name, city, created_at) VALUES (?, ?, ?, 'المقر الرئيسي', 'العريش', ?)").run(branchId, tenantId, businessId, createdAt);
        for (const [code, name, accountType] of [["1000", "النقدية", "ASSET"], ["1100", "المخزون", "ASSET"], ["1200", "الذمم المدينة", "ASSET"], ["4000", "المبيعات", "REVENUE"], ["5000", "تكلفة المبيعات", "EXPENSE"]] as const) db.prepare("INSERT INTO ledger_accounts (id, tenant_id, code, name, account_type, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), tenantId, code, name, accountType, createdAt);
        const token = createSession(db, userId);
        recordAudit(db, { userId, tenantId }, "auth.register", "tenant", tenantId, undefined, { businessId, branchId });
        return { userId, tenantId, businessId, branchId, token };
      });
      return res.status(201).json({ ok: true, ...result });
    } catch (error) { next(error); }
  });

  router.post("/auth/login", (req, res, next) => {
    try {
      if (!allowAuthBurst(`login:${req.ip}`, 10)) throw httpError(429, "rate-limited", "تم تجاوز محاولات الدخول، أعد المحاولة لاحقاً.");
      const email = normalizeEmail(req.body?.email ?? "");
      const password = req.body?.password;
      if (!email || typeof password !== "string") throw httpError(400, "invalid-login", "البريد وكلمة المرور مطلوبان.");
      const db = getDatabase();
      const user = db.prepare("SELECT id, password_hash, status, failed_login_count, locked_until FROM users WHERE email = ?").get(email) as { id: string; password_hash: string | null; status: string; failed_login_count: number; locked_until: number | null } | undefined;
      if (!user || user.status !== "active" || (user.locked_until && user.locked_until > now()) || !verifyPassword(password, user.password_hash)) {
        if (user) {
          const failures = user.failed_login_count + 1;
          db.prepare("UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?").run(failures, failures >= 5 ? now() + 15 * 60 * 1000 : null, now(), user.id);
        }
        throw httpError(401, "invalid-login", "بيانات تسجيل الدخول غير صحيحة.");
      }
      db.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?").run(now(), user.id);
      const token = createSession(db, user.id);
      const memberships = db.prepare("SELECT tenant_id, role FROM tenant_members WHERE user_id = ? ORDER BY created_at").all(user.id) as Array<{ tenant_id: string; role: Role }>;
      return res.json({ ok: true, token, userId: user.id, tenants: memberships });
    } catch (error) { next(error); }
  });

  router.post("/auth/password-reset/request", (req, res, next) => {
    try {
      if (!allowAuthBurst(`password-reset:${req.ip}`, 5)) throw httpError(429, "rate-limited", "تم تجاوز محاولات الاستعادة، أعد المحاولة لاحقاً.");
      const email = normalizeEmail(req.body?.email ?? ""); if (!email) throw httpError(400, "invalid-email", "البريد الإلكتروني مطلوب.");
      const db = getDatabase(); const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined;
      if (user) { const rawToken = randomBytes(32).toString("base64url"); db.prepare("INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), user.id, hashToken(rawToken), now() + 30 * 60 * 1000, now()); }
      return res.status(202).json({ ok: true, status: "accepted", delivery: process.env.EMAIL_PROVIDER_API_KEY ? "queued" : "requires-provider-setup", message: "إذا كان البريد مسجلاً فسيتم إرسال تعليمات الاستعادة عبر القناة المهيأة." });
    } catch (error) { next(error); }
  });

  router.post("/auth/password-reset/confirm", (req, res, next) => {
    try {
      const token = req.body?.token; const password = req.body?.password;
      if (!isNonEmptyString(token, 300) || typeof password !== "string" || password.length < 12) throw httpError(400, "invalid-reset", "رمز الاستعادة وكلمة مرور جديدة (12 حرفاً على الأقل) مطلوبان.");
      const db = getDatabase(); const reset = db.prepare("SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").get(hashToken(token), now()) as { id: string; user_id: string } | undefined;
      if (!reset) throw httpError(400, "invalid-reset", "رمز الاستعادة غير صالح أو منتهي.");
      withTransaction(db, () => { db.prepare("UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?").run(passwordHash(password), now(), reset.user_id); db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(now(), reset.id); db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now(), reset.user_id); });
      return res.json({ ok: true, status: "password-updated" });
    } catch (error) { next(error); }
  });

  router.post("/auth/logout", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const token = (req.header("authorization") ?? "").slice(7) || req.header("x-session-token");
      if (token) getDatabase().prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?").run(now(), hashToken(token));
      return res.json({ ok: true });
    } catch (error) { next(error); }
  });

  router.get("/me", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req);
      const db = getDatabase();
      const tenant = db.prepare("SELECT id, name, slug, status FROM tenants WHERE id = ?").get(context.tenantId);
      const user = db.prepare("SELECT id, email, display_name, status FROM users WHERE id = ?").get(context.userId);
      return res.json({ ok: true, user, tenant, context });
    } catch (error) { next(error); }
  });

  router.get("/plans", (_req, res, next) => {
    try { return res.json({ ok: true, plans: getDatabase().prepare("SELECT code, name, price_cents, trial_days, active FROM plans WHERE active = 1 ORDER BY price_cents").all() }); } catch (error) { next(error); }
  });

  router.post("/subscriptions", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "subscription.manage");
      const planCode = req.body?.planCode;
      if (!isNonEmptyString(planCode, 60)) throw httpError(400, "invalid-plan", "رمز الخطة مطلوب.");
      const db = getDatabase();
      const plan = db.prepare("SELECT code, trial_days, price_cents, active FROM plans WHERE code = ? AND active = 1").get(planCode.trim()) as { code: string; trial_days: number; price_cents: number; active: number } | undefined;
      if (!plan) throw httpError(404, "plan-not-found", "الخطة غير موجودة أو غير مفعلة.");
      const existing = db.prepare("SELECT id, status FROM subscriptions WHERE tenant_id = ?").get(context.tenantId) as { id: string; status: string } | undefined;
      if (existing && ["ACTIVE", "TRIALING"].includes(existing.status)) throw httpError(409, "subscription-exists", "يوجد اشتراك نشط لهذا المستأجر.");
      const started = now();
      const end = started + Math.max(plan.trial_days, 30) * 24 * 60 * 60 * 1000;
      const subscriptionId = existing?.id ?? randomUUID();
      const status = plan.trial_days > 0 ? "TRIALING" : plan.price_cents > 0 ? "PENDING_PAYMENT" : "ACTIVE";
      db.prepare(existing ? "UPDATE subscriptions SET plan_code = ?, status = ?, current_period_start = ?, current_period_end = ?, cancel_at_period_end = 0, updated_at = ? WHERE id = ? AND tenant_id = ?" : "INSERT INTO subscriptions (id, tenant_id, plan_code, status, current_period_start, current_period_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(...(existing ? [plan.code, status, started, end, started, subscriptionId, context.tenantId] : [subscriptionId, context.tenantId, plan.code, status, started, end, started, started]));
      recordAudit(db, context, "subscription.activate", "subscription", subscriptionId, req.requestId, { planCode: plan.code, trialDays: plan.trial_days, priceCents: plan.price_cents, status });
      return res.status(existing ? 200 : 201).json({ ok: true, subscriptionId, planCode: plan.code, status, currentPeriodEnd: end, payment: status === "PENDING_PAYMENT" ? "REQUIRES_SETUP" : "not-required" });
    } catch (error) { next(error); }
  });

  router.get("/subscription", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "subscription.read"); return res.json({ ok: true, subscription: getDatabase().prepare("SELECT s.id, s.plan_code, s.status, s.current_period_start, s.current_period_end, s.cancel_at_period_end, p.price_cents, p.trial_days FROM subscriptions s JOIN plans p ON p.code = s.plan_code WHERE s.tenant_id = ?").get(context.tenantId) ?? null }); } catch (error) { next(error); }
  });

  router.patch("/subscription", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "subscription.manage"); const cancelAtPeriodEnd = req.body?.cancelAtPeriodEnd; if (typeof cancelAtPeriodEnd !== "boolean") throw httpError(400, "invalid-subscription-change", "cancelAtPeriodEnd يجب أن يكون Boolean."); const db = getDatabase(); const subscription = db.prepare("SELECT id, status FROM subscriptions WHERE tenant_id = ?").get(context.tenantId) as { id: string; status: string } | undefined; if (!subscription) throw httpError(404, "subscription-not-found", "لا يوجد اشتراك لهذا المستأجر."); db.prepare("UPDATE subscriptions SET cancel_at_period_end = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").run(cancelAtPeriodEnd ? 1 : 0, now(), subscription.id, context.tenantId); recordAudit(db, context, "subscription.cancel_at_period_end", "subscription", subscription.id, req.requestId, { cancelAtPeriodEnd }); return res.json({ ok: true, subscriptionId: subscription.id, cancelAtPeriodEnd }); } catch (error) { next(error); }
  });

  router.post("/subscription/renew", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "subscription.manage"); const db = getDatabase(); const subscription = db.prepare("SELECT s.id, s.status, s.plan_code, p.price_cents FROM subscriptions s JOIN plans p ON p.code = s.plan_code WHERE s.tenant_id = ?").get(context.tenantId) as { id: string; status: string; plan_code: string; price_cents: number } | undefined; if (!subscription) throw httpError(404, "subscription-not-found", "لا يوجد اشتراك لهذا المستأجر."); if (subscription.price_cents > 0) return res.status(202).json({ ok: true, subscriptionId: subscription.id, status: "REQUIRES_SETUP", message: "تجديد الخطة المدفوعة يتطلب مزود دفع مهيأ؛ لم يتم تمديد الاشتراك." }); const end = now() + 30 * 24 * 60 * 60 * 1000; db.prepare("UPDATE subscriptions SET status = 'ACTIVE', current_period_start = ?, current_period_end = ?, cancel_at_period_end = 0, updated_at = ? WHERE id = ? AND tenant_id = ?").run(now(), end, now(), subscription.id, context.tenantId); recordAudit(db, context, "subscription.renew", "subscription", subscription.id, req.requestId, { planCode: subscription.plan_code }); return res.json({ ok: true, subscriptionId: subscription.id, status: "ACTIVE", currentPeriodEnd: end }); } catch (error) { next(error); }
  });

  router.post("/drivers", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "employee.manage");
      const { userId, licenseNumber } = req.body ?? {};
      if (!isNonEmptyString(userId, 100)) throw httpError(400, "invalid-driver", "معرف المستخدم مطلوب.");
      const db = getDatabase();
      if (!db.prepare("SELECT user_id FROM tenant_members WHERE tenant_id = ? AND user_id = ?").get(context.tenantId, userId)) throw httpError(404, "member-not-found", "السائق يجب أن يكون عضواً في المستأجر.");
      const driverId = randomUUID();
      db.prepare("INSERT INTO drivers (id, tenant_id, user_id, license_number, created_at) VALUES (?, ?, ?, ?, ?)").run(driverId, context.tenantId, userId, isNonEmptyString(licenseNumber, 80) ? licenseNumber.trim() : null, now());
      recordAudit(db, context, "driver.create", "driver", driverId, req.requestId);
      return res.status(201).json({ ok: true, driverId, status: "AVAILABLE" });
    } catch (error) { next(error); }
  });

  router.post("/vehicles", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "employee.manage");
      const { plateNumber, kind = "delivery" } = req.body ?? {};
      if (!isNonEmptyString(plateNumber, 40) || !isNonEmptyString(kind, 60)) throw httpError(400, "invalid-vehicle", "رقم اللوحة ونوع المركبة مطلوبان.");
      const db = getDatabase(); const vehicleId = randomUUID();
      db.prepare("INSERT INTO vehicles (id, tenant_id, plate_number, kind, created_at) VALUES (?, ?, ?, ?, ?)").run(vehicleId, context.tenantId, plateNumber.trim(), kind.trim(), now());
      recordAudit(db, context, "vehicle.create", "vehicle", vehicleId, req.requestId);
      return res.status(201).json({ ok: true, vehicleId, status: "ACTIVE" });
    } catch (error) { next(error); }
  });

  router.post("/deliveries", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "order.manage");
      const { orderId, driverId, vehicleId, deliveryFeeCents = 0 } = req.body ?? {};
      if (!isNonEmptyString(orderId, 100)) throw httpError(400, "invalid-delivery", "معرف الطلب مطلوب.");
      const fee = validateMoney(deliveryFeeCents, "deliveryFeeCents"); const db = getDatabase();
      const result = withTransaction(db, () => {
        if (!db.prepare("SELECT id FROM orders WHERE id = ? AND tenant_id = ?").get(orderId, context.tenantId)) throw httpError(404, "order-not-found", "الطلب غير موجود داخل المستأجر الحالي.");
        if (driverId && !db.prepare("SELECT id FROM drivers WHERE id = ? AND tenant_id = ? AND status = 'AVAILABLE'").get(driverId, context.tenantId)) throw httpError(409, "driver-unavailable", "السائق غير متاح أو خارج المستأجر.");
        if (vehicleId && !db.prepare("SELECT id FROM vehicles WHERE id = ? AND tenant_id = ? AND status = 'ACTIVE'").get(vehicleId, context.tenantId)) throw httpError(409, "vehicle-unavailable", "المركبة غير متاحة أو خارج المستأجر.");
        const deliveryId = randomUUID(); const timestamp = now(); const state = driverId ? "ASSIGNED" : "CREATED";
        db.prepare("INSERT INTO deliveries (id, tenant_id, order_id, driver_id, vehicle_id, state, delivery_fee_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(deliveryId, context.tenantId, orderId, driverId ?? null, vehicleId ?? null, state, fee, timestamp, timestamp);
        db.prepare("INSERT INTO delivery_events (id, tenant_id, delivery_id, state, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), context.tenantId, deliveryId, state, "delivery.created", context.userId, timestamp);
        if (driverId) db.prepare("UPDATE drivers SET status = 'ASSIGNED' WHERE id = ? AND tenant_id = ?").run(driverId, context.tenantId);
        recordAudit(db, context, "delivery.create", "delivery", deliveryId, req.requestId, { orderId, state });
        return { deliveryId, state };
      });
      return res.status(201).json({ ok: true, ...result });
    } catch (error) { next(error); }
  });

  router.post("/deliveries/:deliveryId/proof", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "order.manage"); const { proofType, storageRef, recipientName } = req.body ?? {}; if (!["PHOTO", "SIGNATURE", "OTP", "NOTE"].includes(proofType) || !isNonEmptyString(storageRef, 500)) throw httpError(400, "invalid-proof", "نوع الإثبات ومرجع التخزين مطلوبان."); const db = getDatabase(); const delivery = db.prepare("SELECT id, state FROM deliveries WHERE id = ? AND tenant_id = ?").get(req.params.deliveryId, context.tenantId) as { id: string; state: string } | undefined; if (!delivery) throw httpError(404, "delivery-not-found", "التسليم غير موجود."); if (["CANCELLED", "FAILED"].includes(delivery.state)) throw httpError(409, "invalid-proof-state", "لا يمكن إضافة إثبات لتسليم مغلق."); const proofId = randomUUID(); db.prepare("INSERT INTO delivery_proofs (id, tenant_id, delivery_id, proof_type, storage_ref, content_hash, recipient_name, captured_by, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(proofId, context.tenantId, delivery.id, proofType, storageRef.trim(), hashToken(storageRef), isNonEmptyString(recipientName, 160) ? recipientName.trim() : null, context.userId, now()); recordAudit(db, context, "delivery.proof.create", "delivery_proof", proofId, req.requestId, { deliveryId: delivery.id, proofType }); return res.status(201).json({ ok: true, proofId, status: "RECORDED" }); } catch (error) { next(error); }
  });

  router.patch("/deliveries/:deliveryId/state", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "order.approve");
      const transitions: Record<string, string[]> = { CREATED: ["ASSIGNED", "CANCELLED"], PENDING: ["ASSIGNED", "CANCELLED"], ASSIGNED: ["PICKED_UP", "CANCELLED"], PICKED_UP: ["IN_TRANSIT", "FAILED"], IN_TRANSIT: ["DELIVERED", "FAILED"], DELIVERED: [], FAILED: [], CANCELLED: [] };
      const state = req.body?.state; if (!Object.prototype.hasOwnProperty.call(transitions, state)) throw httpError(400, "invalid-state", "حالة التسليم غير صالحة.");
      const db = getDatabase(); const delivery = db.prepare("SELECT id, state, driver_id FROM deliveries WHERE id = ? AND tenant_id = ?").get(req.params.deliveryId, context.tenantId) as { id: string; state: string; driver_id: string | null } | undefined;
      if (!delivery) throw httpError(404, "delivery-not-found", "التسليم غير موجود داخل المستأجر الحالي.");
      if (!transitions[delivery.state]?.includes(state)) throw httpError(409, "invalid-transition", "انتقال حالة التسليم غير منطقي.");
      if (state === "DELIVERED" && !db.prepare("SELECT id FROM delivery_proofs WHERE delivery_id = ? AND tenant_id = ?").get(delivery.id, context.tenantId)) throw httpError(409, "proof-required", "لا يمكن تأكيد التسليم قبل تسجيل إثبات التسليم.");
      db.prepare("UPDATE deliveries SET state = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").run(state, now(), delivery.id, context.tenantId);
      db.prepare("INSERT INTO delivery_events (id, tenant_id, delivery_id, state, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), context.tenantId, delivery.id, state, context.userId, now());
      if (["DELIVERED", "FAILED", "CANCELLED"].includes(state) && delivery.driver_id) db.prepare("UPDATE drivers SET status = 'AVAILABLE' WHERE id = ? AND tenant_id = ?").run(delivery.driver_id, context.tenantId);
      recordAudit(db, context, "delivery.state.update", "delivery", delivery.id, req.requestId, { from: delivery.state, to: state });
      return res.json({ ok: true, deliveryId: delivery.id, state });
    } catch (error) { next(error); }
  });

  router.get("/notifications", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "notification.read"); return res.json({ ok: true, notifications: getDatabase().prepare("SELECT id, user_id, channel, title, body, status, created_at FROM notifications WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100").all(context.tenantId, context.userId) }); } catch (error) { next(error); }
  });

  router.get("/notifications/preferences", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "notification.read"); return res.json({ ok: true, preferences: getDatabase().prepare("SELECT channel, enabled FROM notification_preferences WHERE tenant_id = ? AND user_id = ? ORDER BY channel").all(context.tenantId, context.userId) }); } catch (error) { next(error); }
  });

  router.put("/notifications/preferences", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "notification.manage"); const preferences = req.body?.preferences; if (!Array.isArray(preferences) || preferences.length > 4 || preferences.some((item: any) => !["IN_APP", "PUSH", "SMS", "EMAIL"].includes(item?.channel) || typeof item?.enabled !== "boolean")) throw httpError(400, "invalid-preferences", "تفضيلات الإشعار غير صالحة."); const db = getDatabase(); for (const preference of preferences) db.prepare("INSERT INTO notification_preferences (tenant_id, user_id, channel, enabled) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, user_id, channel) DO UPDATE SET enabled = excluded.enabled").run(context.tenantId, context.userId, preference.channel, preference.enabled ? 1 : 0); recordAudit(db, context, "notification.preferences.update", "notification_preferences", context.userId, req.requestId, { count: preferences.length }); return res.json({ ok: true, preferences }); } catch (error) { next(error); }
  });

  router.post("/notifications/:notificationId/retry", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "notification.manage"); const db = getDatabase(); const delivery = db.prepare("SELECT id, provider, status, attempts FROM notification_deliveries WHERE notification_id = ? AND tenant_id = ?").get(req.params.notificationId, context.tenantId) as { id: string; provider: string; status: string; attempts: number } | undefined; if (!delivery) throw httpError(404, "delivery-not-found", "محاولة الإرسال غير موجودة."); if (delivery.attempts >= 5) throw httpError(429, "retry-limit", "تم تجاوز حد إعادة المحاولة."); const channel = delivery.provider.toUpperCase() as NotificationChannel; const provider = resolveNotificationProvider(channel); const nextStatus = provider.status === "configured" ? "QUEUED" : "REQUIRES_SETUP"; db.prepare("UPDATE notification_deliveries SET status = ?, attempts = attempts + 1, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").run(nextStatus, provider.status === "configured" ? null : "provider credentials missing", provider.status === "configured" ? now() : null, now(), delivery.id, context.tenantId); recordAudit(db, context, "notification.retry", "notification_delivery", delivery.id, req.requestId, { provider: delivery.provider, status: nextStatus }); return res.status(202).json({ ok: true, deliveryId: delivery.id, status: nextStatus, attempts: delivery.attempts + 1 }); } catch (error) { next(error); }
  });

  router.post("/notifications", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "notification.manage"); const { userId, channel = "IN_APP", title, body } = req.body ?? {};
      if (!isNonEmptyString(userId, 100) || !["IN_APP", "PUSH", "SMS", "EMAIL"].includes(channel) || !isNonEmptyString(title, 160) || !isNonEmptyString(body, 2000)) throw httpError(400, "invalid-notification", "المستخدم والقناة والعنوان والمحتوى مطلوبة.");
      const db = getDatabase(); if (!db.prepare("SELECT user_id FROM tenant_members WHERE tenant_id = ? AND user_id = ?").get(context.tenantId, userId)) throw httpError(404, "member-not-found", "المستخدم خارج المستأجر الحالي.");
      const notificationId = randomUUID(); const notificationChannel = channel as NotificationChannel; db.prepare("INSERT INTO notifications (id, tenant_id, user_id, channel, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(notificationId, context.tenantId, userId, notificationChannel, title.trim(), body.trim(), now());
      const provider = resolveNotificationProvider(notificationChannel); const deliveryStatus = provider.status === "configured" ? "QUEUED" : "REQUIRES_SETUP"; db.prepare("INSERT INTO notification_deliveries (id, tenant_id, notification_id, provider, status, attempts, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?)").run(randomUUID(), context.tenantId, notificationId, notificationChannel.toLowerCase(), deliveryStatus, now());
      recordAudit(db, context, "notification.create", "notification", notificationId, req.requestId, { channel: notificationChannel, userId, deliveryStatus });
      return res.status(201).json({ ok: true, notificationId, status: "QUEUED", delivery: deliveryStatus.toLowerCase().replaceAll("_", "-") });
    } catch (error) { next(error); }
  });

  router.get("/analytics/kpis", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "business.read"); const db = getDatabase();
      const sales = db.prepare("SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS gmv_cents, COALESCE(SUM(CASE WHEN state = 'COMPLETED' THEN total_cents ELSE 0 END), 0) AS completed_gmv_cents FROM orders WHERE tenant_id = ?").get(context.tenantId);
      const inventory = db.prepare("SELECT COALESCE(SUM(quantity), 0) AS units, COUNT(*) AS sku_count FROM inventory_stock WHERE tenant_id = ?").get(context.tenantId);
      const ai = db.prepare("SELECT COUNT(*) AS requests FROM ai_requests WHERE tenant_id = ?").get(context.tenantId);
      const members = db.prepare("SELECT COUNT(*) AS members FROM tenant_members WHERE tenant_id = ?").get(context.tenantId);
      return res.json({ ok: true, source: "database", asOf: new Date().toISOString(), kpis: { sales, inventory, ai, members } });
    } catch (error) { next(error); }
  });

  router.get("/admin/users", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "admin.manage"); const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100); const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0); const search = typeof req.query.search === "string" ? req.query.search.trim() : ""; const db = getDatabase(); const platformWide = context.role === "SUPER_ADMIN" || context.role === "PLATFORM_ADMIN"; const scope = platformWide ? "" : "WHERE tm.tenant_id = ?"; const params: unknown[] = platformWide ? [] : [context.tenantId]; const searchClause = search ? (scope ? " AND " : " WHERE ") + "(u.email LIKE ? OR u.display_name LIKE ?)" : ""; if (search) params.push(`%${search}%`, `%${search}%`); params.push(limit, offset); const users = db.prepare(`SELECT u.id, u.email, u.display_name, u.status, u.created_at FROM users u ${platformWide ? "" : "JOIN tenant_members tm ON tm.user_id = u.id"} ${scope}${searchClause} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(...params); return res.json({ ok: true, users, scope: platformWide ? "platform" : "tenant", limit, offset }); } catch (error) { next(error); }
  });

  router.get("/admin/tenants", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "admin.manage"); const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100); const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0); const search = typeof req.query.search === "string" ? req.query.search.trim() : ""; const db = getDatabase(); const platformWide = context.role === "SUPER_ADMIN" || context.role === "PLATFORM_ADMIN"; const term = `%${search}%`; const tenants = platformWide ? db.prepare("SELECT id, name, slug, status, created_at, updated_at FROM tenants WHERE (? = '' OR name LIKE ? OR slug LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?").all(search, term, term, limit, offset) : db.prepare("SELECT id, name, slug, status, created_at, updated_at FROM tenants WHERE id = ?").all(context.tenantId); return res.json({ ok: true, tenants, scope: platformWide ? "platform" : "tenant", limit, offset }); } catch (error) { next(error); }
  });

  router.patch("/admin/users/:userId/status", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "admin.manage"); const status = req.body?.status; if (!["active", "locked", "disabled"].includes(status)) throw httpError(400, "invalid-user-status", "حالة المستخدم غير صالحة."); if (req.params.userId === context.userId) throw httpError(409, "self-lockout", "لا يمكن للمستخدم تعطيل حسابه من هذا المسار."); const db = getDatabase(); const platformWide = context.role === "SUPER_ADMIN" || context.role === "PLATFORM_ADMIN"; const member = db.prepare(`SELECT u.id FROM users u ${platformWide ? "" : "JOIN tenant_members tm ON tm.user_id = u.id AND tm.tenant_id = ?"} WHERE u.id = ?`).get(...(platformWide ? [req.params.userId] : [context.tenantId, req.params.userId])); if (!member) throw httpError(404, "user-not-found", "المستخدم غير موجود ضمن النطاق المسموح."); db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), req.params.userId); recordAudit(db, context, "admin.user.status", "user", req.params.userId, req.requestId, { status }); return res.json({ ok: true, userId: req.params.userId, status }); } catch (error) { next(error); }
  });

  router.patch("/admin/tenants/:tenantId/status", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "admin.manage"); const status = req.body?.status; if (!["active", "suspended"].includes(status)) throw httpError(400, "invalid-tenant-status", "حالة المستأجر غير صالحة."); const platformWide = context.role === "SUPER_ADMIN" || context.role === "PLATFORM_ADMIN"; if (!platformWide && req.params.tenantId !== context.tenantId) throw httpError(403, "tenant-isolation", "لا يمكن إدارة مستأجر آخر."); const db = getDatabase(); if (!db.prepare("SELECT id FROM tenants WHERE id = ?").get(req.params.tenantId)) throw httpError(404, "tenant-not-found", "المستأجر غير موجود."); db.prepare("UPDATE tenants SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), req.params.tenantId); recordAudit(db, context, "admin.tenant.status", "tenant", req.params.tenantId, req.requestId, { status }); return res.json({ ok: true, tenantId: req.params.tenantId, status }); } catch (error) { next(error); }
  });

  router.get("/admin/audit", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "admin.manage"); const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 200); const platformWide = context.role === "SUPER_ADMIN" || context.role === "PLATFORM_ADMIN"; const db = getDatabase(); const logs = platformWide ? db.prepare("SELECT id, tenant_id, actor_user_id, action, resource_type, resource_id, request_id, metadata_json, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?").all(limit) : db.prepare("SELECT id, tenant_id, actor_user_id, action, resource_type, resource_id, request_id, metadata_json, created_at FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?").all(context.tenantId, limit); return res.json({ ok: true, audit: logs }); } catch (error) { next(error); }
  });

  router.get("/admin/ai-usage", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "admin.manage"); const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 200); const platformWide = context.role === "SUPER_ADMIN" || context.role === "PLATFORM_ADMIN"; const db = getDatabase(); const usage = platformWide ? db.prepare("SELECT tenant_id, user_id, purpose, provider_status, created_at FROM ai_requests ORDER BY created_at DESC LIMIT ?").all(limit) : db.prepare("SELECT tenant_id, user_id, purpose, provider_status, created_at FROM ai_requests WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?").all(context.tenantId, limit); return res.json({ ok: true, usage, accounting: "AIUsage cost ledger requires provider telemetry; no estimate is fabricated." }); } catch (error) { next(error); }
  });

  router.get("/admin/feature-flags", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "admin.manage"); return res.json({ ok: true, flags: getDatabase().prepare("SELECT key, enabled, rollout_percent, metadata_json, updated_at FROM feature_flags ORDER BY key").all() }); } catch (error) { next(error); }
  });

  router.patch("/admin/feature-flags/:key", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "admin.manage"); const key = req.params.key; const enabled = req.body?.enabled; const rolloutPercent = req.body?.rolloutPercent ?? 0; if (!/^[A-Za-z0-9._:-]{2,100}$/.test(key) || typeof enabled !== "boolean" || !Number.isInteger(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100) throw httpError(400, "invalid-feature-flag", "مفتاح العلم والقيم غير صالحة."); const db = getDatabase(); db.prepare("INSERT INTO feature_flags (key, enabled, rollout_percent, metadata_json, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, rollout_percent = excluded.rollout_percent, updated_by = excluded.updated_by, updated_at = excluded.updated_at").run(key, enabled ? 1 : 0, rolloutPercent, json(req.body?.metadata ?? {}), context.userId, now()); recordAudit(db, context, "admin.feature_flag.update", "feature_flag", key, req.requestId, { enabled, rolloutPercent }); return res.json({ ok: true, key, enabled, rolloutPercent }); } catch (error) { next(error); }
  });

  router.get("/admin/overview", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); if (!hasPermission(context, "admin.manage")) throw httpError(403, "forbidden", "هذه الوظيفة مخصصة لإدارة المنصة.");
      const db = getDatabase(); return res.json({ ok: true, scope: context.role === "SUPER_ADMIN" || context.role === "PLATFORM_ADMIN" ? "platform" : "tenant", counts: { users: (db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count, tenants: (db.prepare("SELECT COUNT(*) AS count FROM tenants").get() as { count: number }).count, orders: (db.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number }).count, payments: (db.prepare("SELECT COUNT(*) AS count FROM payment_intents").get() as { count: number }).count, auditLogs: (db.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count } });
    } catch (error) { next(error); }
  });

  router.post("/invoices", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "invoice.manage"); const { orderId } = req.body ?? {}; if (!isNonEmptyString(orderId, 100)) throw httpError(400, "invalid-invoice", "معرف الطلب مطلوب."); const db = getDatabase();
      const order = db.prepare("SELECT id, subtotal_cents, tax_cents, total_cents, currency FROM orders WHERE id = ? AND tenant_id = ?").get(orderId, context.tenantId) as { id: string; subtotal_cents: number; tax_cents: number; total_cents: number; currency: string } | undefined; if (!order) throw httpError(404, "order-not-found", "الطلب غير موجود داخل المستأجر الحالي.");
      const invoice = issueInvoice(db, context, order, req.requestId); return res.status(invoice.status === "ISSUED" && invoice.id ? 201 : 200).json({ ok: true, invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, status: invoice.status });
    } catch (error) { next(error); }
  });

  router.get("/invoices", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "invoice.read"); const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100); return res.json({ ok: true, invoices: getDatabase().prepare("SELECT id, order_id, invoice_number, status, subtotal_cents, tax_cents, total_cents, currency, issued_at FROM invoices WHERE tenant_id = ? ORDER BY issued_at DESC LIMIT ?").all(context.tenantId, limit) }); } catch (error) { next(error); }
  });

  router.post("/refunds", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "order.refund"); const { orderId, amountCents, reason, idempotencyKey } = req.body ?? {}; const amount = validateMoney(amountCents, "amountCents"); if (!isNonEmptyString(orderId, 100) || !isNonEmptyString(reason, 500) || !/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey ?? "")) throw httpError(400, "invalid-refund", "الطلب والمبلغ والسبب ومفتاح Idempotency مطلوبة."); const db = getDatabase();
      const order = db.prepare("SELECT id, total_cents FROM orders WHERE id = ? AND tenant_id = ?").get(orderId, context.tenantId) as { id: string; total_cents: number } | undefined; if (!order) throw httpError(404, "order-not-found", "الطلب غير موجود داخل المستأجر الحالي."); if (amount > order.total_cents) throw httpError(409, "refund-over-limit", "المبلغ أكبر من قيمة الطلب.");
      const existing = db.prepare("SELECT id, status FROM refunds WHERE tenant_id = ? AND idempotency_key = ?").get(context.tenantId, idempotencyKey) as { id: string; status: string } | undefined; if (existing) return res.json({ ok: true, refundId: existing.id, status: existing.status, replay: true });
      const refundId = randomUUID(); const timestamp = now(); db.prepare("INSERT INTO refunds (id, tenant_id, order_id, amount_cents, status, reason, idempotency_key, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'REQUIRES_SETUP', ?, ?, ?, ?, ?)").run(refundId, context.tenantId, order.id, amount, reason.trim(), idempotencyKey, context.userId, timestamp, timestamp); recordAudit(db, context, "refund.request", "refund", refundId, req.requestId, { orderId, amountCents: amount }); return res.status(202).json({ ok: true, refundId, status: "REQUIRES_SETUP", message: "تم تسجيل طلب الاسترداد؛ يلزم مزود دفع رسمي قبل التنفيذ." });
    } catch (error) { next(error); }
  });

  router.post("/ai/documents", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "ai.manage"); const { sourceType, sourceRef, title, content, permissionScope = {} } = req.body ?? {}; if (!isNonEmptyString(sourceType, 80) || !isNonEmptyString(sourceRef, 200) || !isNonEmptyString(title, 240) || !isNonEmptyString(content, 100_000)) throw httpError(400, "invalid-document", "نوع المصدر ومعرفه والعنوان والمحتوى مطلوبة."); const db = getDatabase(); const documentId = randomUUID(); const timestamp = now();
      db.prepare("INSERT INTO ai_documents (id, tenant_id, owner_user_id, source_type, source_ref, title, permission_scope_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)").run(documentId, context.tenantId, context.userId, sourceType.trim(), sourceRef.trim(), title.trim(), json(permissionScope), timestamp, timestamp); db.prepare("INSERT INTO ai_chunks (id, tenant_id, document_id, chunk_index, content, content_hash, metadata_json, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)").run(randomUUID(), context.tenantId, documentId, content.trim(), hashToken(content), json({ sourceType, sourceRef }), timestamp); recordAudit(db, context, "ai.document.ingest", "ai_document", documentId, req.requestId, { sourceType, sourceRef }); return res.status(201).json({ ok: true, documentId, status: "PENDING", embedding: "REQUIRES_SETUP" });
    } catch (error) { next(error); }
  });

  router.post("/ai/search", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "ai.read"); const query = req.body?.query; if (!isNonEmptyString(query, 500)) throw httpError(400, "invalid-query", "نص البحث مطلوب."); const db = getDatabase(); const term = `%${query.trim().replace(/[\\%_]/g, "")}%`; const results = db.prepare("SELECT d.id AS document_id, d.title, d.source_type, d.source_ref, c.id AS chunk_id, substr(c.content, 1, 500) AS snippet, d.permission_scope_json FROM ai_documents d JOIN ai_chunks c ON c.document_id = d.id AND c.tenant_id = d.tenant_id WHERE d.tenant_id = ? AND d.status = 'ACTIVE' AND c.content LIKE ? ORDER BY d.updated_at DESC LIMIT 20").all(context.tenantId, term).map((row) => { const item = row as { permission_scope_json: string }; return { ...item, permission_scope_json: undefined }; });
      recordAudit(db, context, "ai.search", "ai_search", null, req.requestId, { queryHash: hashToken(query), resultCount: results.length, engine: "lexical-fallback" }); return res.json({ ok: true, engine: "lexical-fallback", providerStatus: process.env.AI_PROVIDER_API_KEY ? "configured" : "requires-setup", results });
    } catch (error) { next(error); }
  });

  router.post("/geo/places", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "business.manage"); const { entityType, entityId, city = "العريش", district, latitude, longitude, radiusMeters } = req.body ?? {}; if (!["BUSINESS", "BRANCH", "SERVICE", "DELIVERY_ZONE"].includes(entityType) || !isNonEmptyString(entityId, 100) || !isNonEmptyString(city, 120)) throw httpError(400, "invalid-place", "نوع الكيان والمعرف والمدينة مطلوبة."); const lat = coordinate(latitude, "latitude", -90, 90); const lon = coordinate(longitude, "longitude", -180, 180); const radius = radiusMeters == null ? null : validatePositiveInteger(radiusMeters, "radiusMeters"); const db = getDatabase(); const placeId = randomUUID(); const timestamp = now(); db.prepare("INSERT INTO geo_places (id, tenant_id, entity_type, entity_id, city, district, latitude, longitude, radius_meters, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(placeId, context.tenantId, entityType, entityId, city.trim(), isNonEmptyString(district, 120) ? district.trim() : null, lat, lon, radius, timestamp, timestamp); recordAudit(db, context, "geo.place.upsert", "geo_place", placeId, req.requestId, { entityType, entityId }); return res.status(201).json({ ok: true, placeId, city, latitude: lat, longitude: lon }); } catch (error) { next(error); }
  });

  router.get("/geo/nearby", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "business.read"); const lat = coordinate(req.query.latitude, "latitude", -90, 90); const lon = coordinate(req.query.longitude, "longitude", -180, 180); const radius = Math.min(Math.max(Number(req.query.radiusKm ?? 25) || 25, 0.1), 500); const db = getDatabase(); const places = db.prepare("SELECT id, entity_type, entity_id, city, district, latitude, longitude FROM geo_places WHERE tenant_id = ? LIMIT 1000").all(context.tenantId) as Array<{ id: string; entity_type: string; entity_id: string; city: string; district: string | null; latitude: number; longitude: number }>; const nearby = places.map((place) => ({ ...place, distanceKm: Number(distanceKm(lat, lon, place.latitude, place.longitude).toFixed(3)) })).filter((place) => place.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 100); return res.json({ ok: true, engine: "haversine-tenant-scoped", center: { latitude: lat, longitude: lon }, radiusKm: radius, places: nearby }); } catch (error) { next(error); }
  });

  router.post("/ads/advertisers", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "advertising.manage"); const { businessId, billingAccountRef } = req.body ?? {}; if (!isNonEmptyString(businessId, 100)) throw httpError(400, "invalid-advertiser", "النشاط مطلوب."); const db = getDatabase(); if (!db.prepare("SELECT id FROM businesses WHERE id = ? AND tenant_id = ?").get(businessId, context.tenantId)) throw httpError(404, "business-not-found", "النشاط غير موجود."); const advertiserId = randomUUID(); db.prepare("INSERT INTO advertisers (id, tenant_id, business_id, billing_account_ref, created_at) VALUES (?, ?, ?, ?, ?)").run(advertiserId, context.tenantId, businessId, isNonEmptyString(billingAccountRef, 200) ? billingAccountRef.trim() : null, now()); recordAudit(db, context, "advertiser.create", "advertiser", advertiserId, req.requestId); return res.status(201).json({ ok: true, advertiserId, status: "PENDING" }); } catch (error) { next(error); }
  });

  router.post("/ads/campaigns", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "advertising.manage"); const { advertiserId, name, budgetCents, targeting = {} } = req.body ?? {}; const budget = validateMoney(budgetCents, "budgetCents"); if (!isNonEmptyString(advertiserId, 100) || !isNonEmptyString(name, 160) || budget < 0) throw httpError(400, "invalid-campaign", "المعلن والاسم والميزانية مطلوبة."); const db = getDatabase(); if (!db.prepare("SELECT id FROM advertisers WHERE id = ? AND tenant_id = ?").get(advertiserId, context.tenantId)) throw httpError(404, "advertiser-not-found", "المعلن غير موجود."); const campaignId = randomUUID(); const timestamp = now(); db.prepare("INSERT INTO ad_campaigns (id, tenant_id, advertiser_id, name, budget_cents, targeting_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(campaignId, context.tenantId, advertiserId, name.trim(), budget, json(targeting), timestamp, timestamp); recordAudit(db, context, "ad_campaign.create", "ad_campaign", campaignId, req.requestId, { budgetCents: budget }); return res.status(201).json({ ok: true, campaignId, status: "DRAFT", budgetCents: budget }); } catch (error) { next(error); }
  });

  router.post("/ads/events", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "advertising.read"); const { campaignId, eventType, eventKey } = req.body ?? {}; if (!isNonEmptyString(campaignId, 100) || !["IMPRESSION", "CLICK", "CONVERSION"].includes(eventType) || !isNonEmptyString(eventKey, 200)) throw httpError(400, "invalid-ad-event", "الحملة ونوع الحدث ومفتاحه مطلوبة."); const db = getDatabase(); if (!db.prepare("SELECT id FROM ad_campaigns WHERE id = ? AND tenant_id = ?").get(campaignId, context.tenantId)) throw httpError(404, "campaign-not-found", "الحملة غير موجودة."); db.prepare("INSERT INTO ad_events (id, tenant_id, campaign_id, event_type, user_id, event_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), context.tenantId, campaignId, eventType, context.userId, eventKey.trim(), now()); return res.status(201).json({ ok: true, status: "recorded" }); } catch (error) { next(error); }
  });

  router.get("/marketplace/catalog", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "product.read"); const db = getDatabase();
      const products = db.prepare("SELECT id, 'PRODUCT' AS offering_type, business_id, sku AS code, name, description, category, price_cents, currency, status FROM products WHERE tenant_id = ? AND status = 'active'").all(context.tenantId);
      const services = db.prepare("SELECT id, 'SERVICE' AS offering_type, business_id, NULL AS code, name, description, category, price_cents, 'EGP' AS currency, status FROM services WHERE tenant_id = ? AND status = 'active'").all(context.tenantId);
      return res.json({ ok: true, source: "database", offerings: [...products, ...services] });
    } catch (error) { next(error); }
  });

  router.get("/services", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "product.read"); return res.json({ ok: true, services: getDatabase().prepare("SELECT id, business_id, name, description, category, price_cents, duration_minutes, status FROM services WHERE tenant_id = ? AND status <> 'archived' ORDER BY created_at DESC LIMIT 500").all(context.tenantId) }); } catch (error) { next(error); }
  });

  router.post("/services", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "product.manage"); const { businessId, name, description, category, priceCents, durationMinutes } = req.body ?? {};
      if (!isNonEmptyString(businessId, 100) || !isNonEmptyString(name, 160)) throw httpError(400, "invalid-service", "النشاط واسم الخدمة مطلوبان.");
      const price = validateMoney(priceCents, "priceCents"); const duration = durationMinutes == null ? null : validatePositiveInteger(durationMinutes, "durationMinutes"); const db = getDatabase();
      if (!db.prepare("SELECT id FROM businesses WHERE id = ? AND tenant_id = ?").get(businessId, context.tenantId)) throw httpError(404, "business-not-found", "النشاط غير موجود داخل المستأجر الحالي.");
      const serviceId = randomUUID(); const timestamp = now(); db.prepare("INSERT INTO services (id, tenant_id, business_id, name, description, category, price_cents, duration_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(serviceId, context.tenantId, businessId, name.trim(), isNonEmptyString(description, 2000) ? description.trim() : null, isNonEmptyString(category, 120) ? category.trim() : null, price, duration, timestamp, timestamp);
      recordAudit(db, context, "service.create", "service", serviceId, req.requestId, { businessId }); return res.status(201).json({ ok: true, serviceId });
    } catch (error) { next(error); }
  });

  router.get("/cart", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "order.read"); const db = getDatabase();
      const cart = db.prepare("SELECT id, branch_id, status, updated_at FROM carts WHERE tenant_id = ? AND user_id = ? AND status = 'ACTIVE'").get(context.tenantId, context.userId) as { id: string; branch_id: string | null; status: string; updated_at: number } | undefined;
      if (!cart) return res.json({ ok: true, cart: null, items: [], totalCents: 0 });
      const items = db.prepare("SELECT ci.id, ci.product_id, p.sku, p.name, ci.quantity, ci.unit_price_cents, ci.quantity * ci.unit_price_cents AS line_total_cents FROM cart_items ci JOIN products p ON p.id = ci.product_id AND p.tenant_id = ci.tenant_id WHERE ci.cart_id = ? AND ci.tenant_id = ? ORDER BY ci.created_at").all(cart.id, context.tenantId) as Array<{ line_total_cents: number }>;
      return res.json({ ok: true, cart, items, totalCents: items.reduce((sum, item) => sum + item.line_total_cents, 0) });
    } catch (error) { next(error); }
  });

  router.post("/cart/items", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "order.manage"); const { productId, quantity, branchId } = req.body ?? {};
      if (!isNonEmptyString(productId, 100)) throw httpError(400, "invalid-cart-item", "المنتج مطلوب."); const count = validatePositiveInteger(quantity, "quantity"); const db = getDatabase();
      if (branchId && !db.prepare("SELECT id FROM branches WHERE id = ? AND tenant_id = ?").get(branchId, context.tenantId)) throw httpError(404, "branch-not-found", "الفرع غير موجود داخل المستأجر الحالي.");
      const product = db.prepare("SELECT id, price_cents FROM products WHERE id = ? AND tenant_id = ? AND status = 'active'").get(productId, context.tenantId) as { id: string; price_cents: number } | undefined;
      if (!product) throw httpError(404, "product-not-found", "المنتج غير موجود أو غير منشور.");
      const result = withTransaction(db, () => {
        let cart = db.prepare("SELECT id FROM carts WHERE tenant_id = ? AND user_id = ? AND status = 'ACTIVE'").get(context.tenantId, context.userId) as { id: string } | undefined;
        if (!cart) { cart = { id: randomUUID() }; db.prepare("INSERT INTO carts (id, tenant_id, user_id, branch_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(cart.id, context.tenantId, context.userId, branchId ?? null, now(), now()); }
        else if (branchId) db.prepare("UPDATE carts SET branch_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").run(branchId, now(), cart.id, context.tenantId);
        db.prepare("INSERT INTO cart_items (id, cart_id, tenant_id, product_id, quantity, unit_price_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = excluded.quantity, unit_price_cents = excluded.unit_price_cents").run(randomUUID(), cart.id, context.tenantId, product.id, count, product.price_cents, now());
        return cart.id;
      });
      recordAudit(db, context, "cart.item.upsert", "cart", result, req.requestId, { productId, quantity: count }); return res.status(201).json({ ok: true, cartId: result });
    } catch (error) { next(error); }
  });

  router.delete("/cart/items/:productId", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "order.manage"); const db = getDatabase(); db.prepare("DELETE FROM cart_items WHERE tenant_id = ? AND product_id = ? AND cart_id IN (SELECT id FROM carts WHERE tenant_id = ? AND user_id = ? AND status = 'ACTIVE')").run(context.tenantId, req.params.productId, context.tenantId, context.userId); return res.json({ ok: true }); } catch (error) { next(error); }
  });

  router.post("/cart/checkout", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "order.manage"); const branchId = req.body?.branchId; if (!isNonEmptyString(branchId, 100)) throw httpError(400, "requires-branch", "الفرع مطلوب لإتمام الطلب."); const db = getDatabase();
      const result = withTransaction(db, () => {
        const cart = db.prepare("SELECT id FROM carts WHERE tenant_id = ? AND user_id = ? AND status = 'ACTIVE'").get(context.tenantId, context.userId) as { id: string } | undefined; if (!cart) throw httpError(409, "empty-cart", "السلة فارغة.");
        const items = db.prepare("SELECT ci.product_id, ci.quantity, ci.unit_price_cents, p.business_id FROM cart_items ci JOIN products p ON p.id = ci.product_id AND p.tenant_id = ci.tenant_id WHERE ci.cart_id = ? AND ci.tenant_id = ? AND p.status = 'active'").all(cart.id, context.tenantId) as Array<{ product_id: string; quantity: number; unit_price_cents: number; business_id: string }>;
        if (!items.length) throw httpError(409, "empty-cart", "السلة لا تحتوي منتجات منشورة."); const businesses = new Set(items.map((item) => item.business_id)); if (businesses.size !== 1) throw httpError(409, "multi-business-cart", "يجب أن تنتمي السلة إلى نشاط واحد.");
        if (!db.prepare("SELECT id FROM branches WHERE id = ? AND tenant_id = ? AND business_id = ?").get(branchId, context.tenantId, items[0].business_id)) throw httpError(404, "branch-not-found", "الفرع غير مرتبط بالنشاط الحالي.");
        let subtotal = 0; for (const item of items) { const stock = db.prepare("SELECT quantity FROM inventory_stock WHERE tenant_id = ? AND branch_id = ? AND product_id = ?").get(context.tenantId, branchId, item.product_id) as { quantity: number } | undefined; if ((stock?.quantity ?? 0) < item.quantity) throw httpError(409, "insufficient-stock", "المخزون غير كافٍ لإتمام السلة."); subtotal += item.quantity * item.unit_price_cents; }
        const orderId = randomUUID(); const timestamp = now(); db.prepare("INSERT INTO orders (id, tenant_id, business_id, branch_id, subtotal_cents, total_cents, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(orderId, context.tenantId, items[0].business_id, branchId, subtotal, subtotal, context.userId, timestamp, timestamp);
        const itemInsert = db.prepare("INSERT INTO order_items (id, order_id, tenant_id, product_id, quantity, unit_price_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)"); const movementInsert = db.prepare("INSERT INTO inventory_movements (id, tenant_id, branch_id, product_id, quantity_delta, reason, idempotency_key, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'cart-checkout', ?, ?, ?)");
        for (const item of items) { itemInsert.run(randomUUID(), orderId, context.tenantId, item.product_id, item.quantity, item.unit_price_cents, item.quantity * item.unit_price_cents); movementInsert.run(randomUUID(), context.tenantId, branchId, item.product_id, -item.quantity, `${orderId}:${item.product_id}`, context.userId, timestamp); const update = db.prepare("UPDATE inventory_stock SET quantity = quantity - ?, updated_at = ? WHERE tenant_id = ? AND branch_id = ? AND product_id = ? AND quantity >= ?").run(item.quantity, timestamp, context.tenantId, branchId, item.product_id, item.quantity) as { changes?: number }; if (update.changes !== 1) throw httpError(409, "insufficient-stock", "تغير المخزون أثناء إتمام السلة."); }
        postBalancedSaleJournal(db, context, orderId, subtotal, req.requestId);
        issueInvoice(db, context, { id: orderId, subtotal_cents: subtotal, tax_cents: 0, total_cents: subtotal, currency: "EGP" }, req.requestId);
        db.prepare("UPDATE carts SET status = 'CHECKED_OUT', updated_at = ? WHERE id = ? AND tenant_id = ?").run(timestamp, cart.id, context.tenantId); db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_user_id, action, resource_type, resource_id, request_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), context.tenantId, context.userId, "cart.checkout", "order", orderId, req.requestId ?? null, json({ totalCents: subtotal }), timestamp); return { orderId, totalCents: subtotal };
      });
      return res.status(201).json({ ok: true, ...result, state: "PENDING" });
    } catch (error) { next(error); }
  });

  router.get("/products", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "product.read");
      const db = getDatabase();
      const products = db.prepare("SELECT id, business_id, sku, name, description, category, price_cents, currency, status, created_at, updated_at FROM products WHERE tenant_id = ? AND status <> 'archived' ORDER BY created_at DESC LIMIT 500").all(context.tenantId);
      return res.json({ ok: true, products });
    } catch (error) { next(error); }
  });

  router.post("/products", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "product.manage");
      const { businessId, sku, name, description, category, priceCents } = req.body ?? {};
      if (!isNonEmptyString(businessId, 100) || !isNonEmptyString(sku, 80) || !isNonEmptyString(name, 160)) throw httpError(400, "invalid-product", "النشاط والرمز والاسم مطلوبة.");
      const price = validateMoney(priceCents, "priceCents");
      const db = getDatabase();
      const business = db.prepare("SELECT id FROM businesses WHERE id = ? AND tenant_id = ?").get(businessId, context.tenantId);
      if (!business) throw httpError(404, "business-not-found", "النشاط غير موجود داخل المستأجر الحالي.");
      const productId = randomUUID();
      const createdAt = now();
      db.prepare("INSERT INTO products (id, tenant_id, business_id, sku, name, description, category, price_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(productId, context.tenantId, businessId, sku.trim(), name.trim(), isNonEmptyString(description, 2000) ? description.trim() : null, isNonEmptyString(category, 120) ? category.trim() : null, price, createdAt, createdAt);
      recordAudit(db, context, "product.create", "product", productId, req.requestId, { businessId });
      return res.status(201).json({ ok: true, productId });
    } catch (error) { next(error); }
  });

  router.post("/inventory/movements", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "inventory.manage");
      const { branchId, productId, quantityDelta, reason, idempotencyKey } = req.body ?? {};
      if (!isNonEmptyString(branchId, 100) || !isNonEmptyString(productId, 100) || !isNonEmptyString(reason, 120) || !/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey ?? "")) throw httpError(400, "invalid-movement", "الفرع والمنتج والسبب ومفتاح Idempotency مطلوبة.");
      if (!Number.isInteger(quantityDelta) || quantityDelta === 0 || Math.abs(quantityDelta) > 1_000_000) throw httpError(400, "invalid-movement", "كمية الحركة يجب أن تكون عدداً صحيحاً غير صفري.");
      const db = getDatabase();
      const response = withTransaction(db, () => {
        const duplicate = db.prepare("SELECT id, quantity_delta FROM inventory_movements WHERE tenant_id = ? AND idempotency_key = ?").get(context.tenantId, idempotencyKey) as { id: string; quantity_delta: number } | undefined;
        if (duplicate) {
          if (duplicate.quantity_delta !== quantityDelta) throw httpError(409, "idempotency-conflict", "مفتاح الحركة مستخدم بكمية مختلفة.");
          return { movementId: duplicate.id, replay: true };
        }
        const validScope = db.prepare("SELECT p.id, b.id AS branch_id FROM products p JOIN branches b ON b.id = ? AND b.tenant_id = p.tenant_id WHERE p.id = ? AND p.tenant_id = ?").get(branchId, productId, context.tenantId);
        if (!validScope) throw httpError(404, "scope-not-found", "المنتج أو الفرع غير موجود داخل المستأجر الحالي.");
        const current = db.prepare("SELECT quantity FROM inventory_stock WHERE tenant_id = ? AND branch_id = ? AND product_id = ?").get(context.tenantId, branchId, productId) as { quantity: number } | undefined;
        const nextQuantity = (current?.quantity ?? 0) + quantityDelta;
        if (nextQuantity < 0) throw httpError(409, "negative-stock", "لا يمكن أن يصبح المخزون سالباً.");
        const movementId = randomUUID();
        db.prepare("INSERT INTO inventory_movements (id, tenant_id, branch_id, product_id, quantity_delta, reason, idempotency_key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(movementId, context.tenantId, branchId, productId, quantityDelta, reason.trim(), idempotencyKey, context.userId, now());
        db.prepare("INSERT INTO inventory_stock (tenant_id, branch_id, product_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (tenant_id, branch_id, product_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at").run(context.tenantId, branchId, productId, nextQuantity, now());
        recordAudit(db, context, "inventory.movement.create", "inventory_movement", movementId, req.requestId, { branchId, productId, quantityDelta, nextQuantity });
        return { movementId, quantity: nextQuantity, replay: false };
      });
      return res.status(response.replay ? 200 : 201).json({ ok: true, ...response });
    } catch (error) { next(error); }
  });

  router.get("/inventory", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "inventory.read");
      const stock = getDatabase().prepare("SELECT s.branch_id, s.product_id, s.quantity, p.sku, p.name, s.updated_at FROM inventory_stock s JOIN products p ON p.id = s.product_id AND p.tenant_id = s.tenant_id WHERE s.tenant_id = ? ORDER BY s.updated_at DESC LIMIT 1000").all(context.tenantId);
      return res.json({ ok: true, stock });
    } catch (error) { next(error); }
  });

  router.post("/ledger/journals", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "ledger.manage");
      const { referenceType, referenceId, memo, idempotencyKey, entries } = req.body ?? {};
      if (!isNonEmptyString(referenceType, 80) || !isNonEmptyString(referenceId, 120) || !isNonEmptyString(memo, 500) || !/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey ?? "") || !Array.isArray(entries) || entries.length < 2 || entries.length > 50) throw httpError(400, "invalid-journal", "القيد يحتاج مرجعاً ومذكرة ومفتاحاً وقائمتين على الأقل.");
      const normalized = entries.map((entry: any, index: number) => ({ accountId: entry?.accountId, debitCents: validateMoney(entry?.debitCents ?? 0, `entries[${index}].debitCents`), creditCents: validateMoney(entry?.creditCents ?? 0, `entries[${index}].creditCents`) }));
      if (normalized.some((entry) => (entry.debitCents > 0) === (entry.creditCents > 0))) throw httpError(400, "invalid-journal", "كل سطر يجب أن يكون مديناً أو دائناً فقط.");
      const debit = normalized.reduce((sum, entry) => sum + entry.debitCents, 0);
      const credit = normalized.reduce((sum, entry) => sum + entry.creditCents, 0);
      if (debit !== credit || debit === 0) throw httpError(400, "unbalanced-journal", "يجب أن يتساوى إجمالي المدين مع إجمالي الدائن.");
      const db = getDatabase();
      const result = withTransaction(db, () => {
        const existing = db.prepare("SELECT id FROM ledger_journals WHERE tenant_id = ? AND idempotency_key = ?").get(context.tenantId, idempotencyKey) as { id: string } | undefined;
        if (existing) return { journalId: existing.id, replay: true };
        const accountIds = normalized.map((entry) => entry.accountId);
        if (accountIds.some((accountId) => typeof accountId !== "string" || !db.prepare("SELECT id FROM ledger_accounts WHERE id = ? AND tenant_id = ?").get(accountId, context.tenantId))) throw httpError(400, "invalid-account", "كل الحسابات يجب أن تنتمي إلى المستأجر الحالي.");
        const journalId = randomUUID();
        db.prepare("INSERT INTO ledger_journals (id, tenant_id, reference_type, reference_id, memo, idempotency_key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(journalId, context.tenantId, referenceType.trim(), referenceId.trim(), memo.trim(), idempotencyKey, context.userId, now());
        const insert = db.prepare("INSERT INTO ledger_entries (id, journal_id, tenant_id, account_id, line_no, debit_cents, credit_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        normalized.forEach((entry, index) => insert.run(randomUUID(), journalId, context.tenantId, entry.accountId, index + 1, entry.debitCents, entry.creditCents, now()));
        recordAudit(db, context, "ledger.journal.create", "ledger_journal", journalId, req.requestId, { debitCents: debit, creditCents: credit });
        return { journalId, replay: false };
      });
      return res.status(result.replay ? 200 : 201).json({ ok: true, ...result, totalCents: debit });
    } catch (error) { next(error); }
  });

  router.post("/orders", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "order.manage");
      const { businessId, branchId, customerId, items, discountCents = 0, taxCents = 0 } = req.body ?? {};
      if (!isNonEmptyString(businessId, 100) || !isNonEmptyString(branchId, 100) || !Array.isArray(items) || items.length < 1 || items.length > 100) throw httpError(400, "invalid-order", "النشاط والفرع وعنصر واحد على الأقل مطلوبة.");
      const discount = validateMoney(discountCents, "discountCents"); const tax = validateMoney(taxCents, "taxCents");
      const db = getDatabase();
      const result = withTransaction(db, () => {
        const branch = db.prepare("SELECT id FROM branches WHERE id = ? AND tenant_id = ? AND business_id = ?").get(branchId, context.tenantId, businessId);
        if (!branch) throw httpError(404, "branch-not-found", "الفرع غير موجود داخل النشاط والمستأجر الحالي.");
        let subtotal = 0;
        const resolved = items.map((item: any) => {
          if (!isNonEmptyString(item?.productId, 100)) throw httpError(400, "invalid-order", "معرف المنتج مطلوب.");
          const quantity = validatePositiveInteger(item.quantity, "quantity");
          const product = db.prepare("SELECT id, price_cents FROM products WHERE id = ? AND tenant_id = ? AND business_id = ? AND status = 'active'").get(item.productId, context.tenantId, businessId) as { id: string; price_cents: number } | undefined;
          if (!product) throw httpError(404, "product-not-found", "المنتج غير موجود أو غير منشور.");
          const stock = db.prepare("SELECT quantity FROM inventory_stock WHERE tenant_id = ? AND branch_id = ? AND product_id = ?").get(context.tenantId, branchId, product.id) as { quantity: number } | undefined;
          if ((stock?.quantity ?? 0) < quantity) throw httpError(409, "insufficient-stock", "المخزون غير كافٍ.");
          const lineTotal = product.price_cents * quantity; subtotal += lineTotal;
          return { productId: product.id, quantity, unitPriceCents: product.price_cents, lineTotal };
        });
        const total = subtotal - Math.min(discount, subtotal) + tax;
        const orderId = randomUUID(); const timestamp = now();
        db.prepare("INSERT INTO orders (id, tenant_id, business_id, branch_id, customer_id, subtotal_cents, discount_cents, tax_cents, total_cents, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(orderId, context.tenantId, businessId, branchId, isNonEmptyString(customerId, 100) ? customerId : null, subtotal, Math.min(discount, subtotal), tax, total, context.userId, timestamp, timestamp);
        const itemInsert = db.prepare("INSERT INTO order_items (id, order_id, tenant_id, product_id, quantity, unit_price_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)");
        const movementInsert = db.prepare("INSERT INTO inventory_movements (id, tenant_id, branch_id, product_id, quantity_delta, reason, idempotency_key, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'order', ?, ?, ?)");
        for (const item of resolved) {
          itemInsert.run(randomUUID(), orderId, context.tenantId, item.productId, item.quantity, item.unitPriceCents, item.lineTotal);
          const movementId = randomUUID(); movementInsert.run(movementId, context.tenantId, branchId, item.productId, -item.quantity, `${orderId}:${item.productId}`, context.userId, timestamp);
          const update = db.prepare("UPDATE inventory_stock SET quantity = quantity - ?, updated_at = ? WHERE tenant_id = ? AND branch_id = ? AND product_id = ? AND quantity >= ?").run(item.quantity, timestamp, context.tenantId, branchId, item.productId, item.quantity) as { changes?: number };
          if (update.changes !== 1) throw httpError(409, "insufficient-stock", "تغير المخزون أثناء إنشاء الطلب.");
        }
        postBalancedSaleJournal(db, context, orderId, total, req.requestId);
        issueInvoice(db, context, { id: orderId, subtotal_cents: subtotal, tax_cents: tax, total_cents: total, currency: "EGP" }, req.requestId);
        recordAudit(db, context, "order.create", "order", orderId, req.requestId, { totalCents: total, itemCount: resolved.length });
        return { orderId, state: "PENDING", totalCents: total, currency: "EGP" };
      });
      return res.status(201).json({ ok: true, ...result });
    } catch (error) { next(error); }
  });

  router.get("/orders", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "order.read"); return res.json({ ok: true, orders: getDatabase().prepare("SELECT id, business_id, branch_id, customer_id, state, subtotal_cents, discount_cents, tax_cents, total_cents, currency, created_at, updated_at FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 500").all(context.tenantId) }); } catch (error) { next(error); }
  });

  router.patch("/orders/:orderId/state", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "order.approve");
      const nextState = req.body?.state;
      if (!Object.prototype.hasOwnProperty.call(ORDER_TRANSITIONS, nextState)) throw httpError(400, "invalid-state", "حالة الطلب غير صالحة.");
      const db = getDatabase();
      const order = db.prepare("SELECT id, state FROM orders WHERE id = ? AND tenant_id = ?").get(req.params.orderId, context.tenantId) as { id: string; state: string } | undefined;
      if (!order) throw httpError(404, "order-not-found", "الطلب غير موجود داخل المستأجر الحالي.");
      if (!ORDER_TRANSITIONS[order.state]?.includes(nextState)) throw httpError(409, "invalid-transition", "انتقال حالة الطلب غير منطقي.");
      withTransaction(db, () => {
        if (nextState === "CANCELLED") {
          const items = db.prepare("SELECT product_id, quantity FROM order_items WHERE order_id = ? AND tenant_id = ?").all(order.id, context.tenantId) as Array<{ product_id: string; quantity: number }>;
          for (const item of items) { const movementKey = `order-cancel:${order.id}:${item.product_id}`; const prior = db.prepare("SELECT id FROM inventory_movements WHERE tenant_id = ? AND idempotency_key = ?").get(context.tenantId, movementKey); if (!prior) { db.prepare("INSERT INTO inventory_movements (id, tenant_id, branch_id, product_id, quantity_delta, reason, idempotency_key, created_by, created_at) SELECT ?, tenant_id, branch_id, product_id, ?, 'order-cancellation', ?, ?, ? FROM orders JOIN order_items ON order_items.order_id = orders.id WHERE orders.id = ? AND orders.tenant_id = ? AND order_items.product_id = ?").run(randomUUID(), item.quantity, movementKey, context.userId, now(), order.id, context.tenantId, item.product_id); db.prepare("UPDATE inventory_stock SET quantity = quantity + (SELECT quantity FROM order_items WHERE order_id = ? AND product_id = ? LIMIT 1), updated_at = ? WHERE tenant_id = ? AND branch_id = (SELECT branch_id FROM orders WHERE id = ? AND tenant_id = ?) AND product_id = ?").run(order.id, item.product_id, now(), context.tenantId, order.id, context.tenantId, item.product_id); } }
          const total = (db.prepare("SELECT total_cents FROM orders WHERE id = ? AND tenant_id = ?").get(order.id, context.tenantId) as { total_cents: number }).total_cents; postBalancedCancellationJournal(db, context, order.id, total, req.requestId); db.prepare("UPDATE invoices SET status = 'VOID' WHERE tenant_id = ? AND order_id = ? AND status = 'ISSUED'").run(context.tenantId, order.id);
        }
        db.prepare("UPDATE orders SET state = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").run(nextState, now(), order.id, context.tenantId);
      });
      recordAudit(db, context, "order.state.update", "order", order.id, req.requestId, { from: order.state, to: nextState });
      return res.json({ ok: true, orderId: order.id, state: nextState });
    } catch (error) { next(error); }
  });

  router.post("/payment-intents", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "payment.manage");
      const { orderId, amountCents, provider = "paymob", idempotencyKey } = req.body ?? {};
      const amount = validateMoney(amountCents, "amountCents");
      if (amount <= 0 || !isNonEmptyString(provider, 40) || !/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey ?? "")) throw httpError(400, "invalid-payment", "المبلغ والمزود ومفتاح Idempotency مطلوبة.");
      const db = getDatabase();
      const paymentProvider = resolvePaymentProvider(provider);
      const order = isNonEmptyString(orderId, 100) ? db.prepare("SELECT id, total_cents FROM orders WHERE id = ? AND tenant_id = ?").get(orderId, context.tenantId) as { id: string; total_cents: number } | undefined : undefined;
      if (order && order.total_cents !== amount) throw httpError(409, "amount-mismatch", "قيمة الدفع لا تطابق قيمة الطلب.");
      const existing = db.prepare("SELECT id, status FROM payment_intents WHERE tenant_id = ? AND idempotency_key = ?").get(context.tenantId, idempotencyKey) as { id: string; status: string } | undefined;
      if (existing) return res.json({ ok: true, paymentIntentId: existing.id, status: existing.status, replay: true });
      const configured = paymentProvider.status === "configured";
      const paymentIntentId = randomUUID(); const timestamp = now();
      db.prepare("INSERT INTO payment_intents (id, tenant_id, order_id, provider, amount_cents, status, idempotency_key, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(paymentIntentId, context.tenantId, order?.id ?? null, paymentProvider.name, amount, configured ? "REQUIRES_ACTION" : "REQUIRES_SETUP", idempotencyKey, context.userId, timestamp, timestamp);
      recordAudit(db, context, "payment_intent.create", "payment_intent", paymentIntentId, req.requestId, { provider, amountCents: amount, configured });
      return res.status(201).json({ ok: true, paymentIntentId, status: configured ? "REQUIRES_ACTION" : "REQUIRES_SETUP", message: configured ? "يلزم إكمال خطوة مزود الدفع." : "يلزم إعداد بيانات مزود الدفع؛ لم يتم إعلان نجاح أو تسوية." });
    } catch (error) { next(error); }
  });

  router.post("/ai/requests", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); assertScope(context, context.tenantId, "ai.manage");
      const { purpose, input, allowedDataScope } = req.body ?? {};
      if (!isNonEmptyString(purpose, 100) || !isNonEmptyString(input, 12_000) || !Array.isArray(allowedDataScope) || allowedDataScope.some((item: unknown) => !isNonEmptyString(item, 80))) throw httpError(400, "invalid-ai-request", "غرض الطلب والمدخل ونطاق البيانات المسموح مطلوبة.");
      if (/(ignore|disregard|override).*(system|policy|permission)|تجاهل.*(التعليمات|السياسة|الصلاحيات)/i.test(input)) throw httpError(400, "prompt-injection", "تم رفض مدخل يحاول تجاوز سياسات النظام.");
      const db = getDatabase(); const requestId = randomUUID();
      const allowed = Array.from(new Set(allowedDataScope as string[])).sort();
      db.prepare("INSERT INTO ai_requests (id, tenant_id, user_id, purpose, input_hash, allowed_data_scope, provider_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(requestId, context.tenantId, context.userId, purpose.trim(), hashToken(input), json(allowed), process.env.AI_PROVIDER_API_KEY ? "QUEUED" : "REQUIRES_SETUP", now());
      recordAudit(db, context, "ai.request.create", "ai_request", requestId, req.requestId, { purpose, allowedDataScope: allowed });
      return res.status(201).json({ ok: true, requestId, status: process.env.AI_PROVIDER_API_KEY ? "QUEUED" : "REQUIRES_SETUP", tenantId: context.tenantId, userId: context.userId, allowedDataScope: allowed, message: process.env.AI_PROVIDER_API_KEY ? "تم تسجيل الطلب ضمن نطاق البيانات المصرح." : "موفر الذكاء الاصطناعي غير مهيأ؛ لم يتم اختلاق نتيجة." });
    } catch (error) { next(error); }
  });

  router.post("/ai/agents/prepare", authenticate, (req: AuthenticatedRequest, res, next) => {
    try {
      const context = currentContext(req); const { purpose, tools = [], requestedAction = "read", tenantScope, policy = {}, authorizationGranted = false } = req.body ?? {}; if (!isNonEmptyString(purpose, 120) || !Array.isArray(tools) || tools.length > 20 || tools.some((tool: unknown) => !isNonEmptyString(tool, 80)) || tenantScope !== context.tenantId) throw httpError(400, "invalid-agent-policy", "غرض الوكيل والأدوات ونطاق المستأجر غير صالحة."); const sensitivePermissions: Record<string, Permission> = { payment: "payment.manage", refund: "order.refund", permission_change: "admin.manage", account_deletion: "admin.manage", subscription_change: "subscription.manage" }; const requiredPermission = sensitivePermissions[String(requestedAction)] ?? "ai.manage"; assertScope(context, context.tenantId, requiredPermission); if (/(payment|refund|permission_change|account_deletion|subscription_change)/i.test(String(requestedAction)) && authorizationGranted !== true) { const db = getDatabase(); const agentId = randomUUID(); db.prepare("INSERT INTO ai_agent_runs (id, tenant_id, user_id, purpose, policy_json, permissions_json, tenant_scope, tool_allowlist_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BLOCKED_POLICY', ?)").run(agentId, context.tenantId, context.userId, purpose.trim(), json(policy), json([requiredPermission]), context.tenantId, json(tools), now()); recordAudit(db, context, "ai.agent.blocked", "ai_agent_run", agentId, req.requestId, { requestedAction, requiredPermission }); return res.status(403).json({ ok: false, agentId, status: "BLOCKED_POLICY", message: "الأفعال الحساسة تحتاج authorization صريحاً؛ لم يتم التنفيذ." }); }
      const db = getDatabase(); const agentId = randomUUID(); const status = process.env.AI_PROVIDER_API_KEY ? "VERIFIED_PENDING" : "REQUIRES_SETUP"; db.prepare("INSERT INTO ai_agent_runs (id, tenant_id, user_id, purpose, policy_json, permissions_json, tenant_scope, tool_allowlist_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(agentId, context.tenantId, context.userId, purpose.trim(), json(policy), json([requiredPermission]), context.tenantId, json(tools), status, now()); recordAudit(db, context, "ai.agent.prepare", "ai_agent_run", agentId, req.requestId, { requestedAction, requiredPermission, tools }); return res.status(201).json({ ok: true, agentId, status, requestedAction, toolAllowlist: tools, message: status === "REQUIRES_SETUP" ? "موفر AI غير مهيأ؛ لم يتم تشغيل الوكيل." : "تم التحقق من السياسة؛ التنفيذ الفعلي للأدوات يحتاج adapter مربوطاً." });
    } catch (error) { next(error); }
  });

  router.post("/ai/usage", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "ai.manage"); const { requestId, feature, model, inputTokens = 0, outputTokens = 0, latencyMs = 0, costCents = null } = req.body ?? {}; if (!isNonEmptyString(requestId, 100) || !isNonEmptyString(feature, 100) || !isNonEmptyString(model, 120) || !Number.isInteger(inputTokens) || inputTokens < 0 || !Number.isInteger(outputTokens) || outputTokens < 0 || !Number.isInteger(latencyMs) || latencyMs < 0 || (costCents !== null && (!Number.isInteger(costCents) || costCents < 0))) throw httpError(400, "invalid-ai-usage", "بيانات استخدام AI غير صالحة."); const db = getDatabase(); const request = db.prepare("SELECT id, user_id FROM ai_requests WHERE id = ? AND tenant_id = ?").get(requestId, context.tenantId) as { id: string; user_id: string } | undefined; if (!request) throw httpError(404, "ai-request-not-found", "طلب AI غير موجود داخل المستأجر."); const totalTokens = inputTokens + outputTokens; db.prepare("INSERT INTO ai_usage (id, tenant_id, user_id, request_id, feature, model, input_tokens, output_tokens, total_tokens, latency_ms, cost_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, request_id) DO UPDATE SET feature = excluded.feature, model = excluded.model, input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens, total_tokens = excluded.total_tokens, latency_ms = excluded.latency_ms, cost_cents = excluded.cost_cents").run(randomUUID(), context.tenantId, request.user_id, request.id, feature.trim(), model.trim(), inputTokens, outputTokens, totalTokens, latencyMs, costCents, now()); recordAudit(db, context, "ai.usage.record", "ai_usage", request.id, req.requestId, { feature, model, totalTokens, costCents }); return res.status(201).json({ ok: true, requestId, totalTokens, costCents }); } catch (error) { next(error); }
  });

  router.get("/audit", authenticate, (req: AuthenticatedRequest, res, next) => {
    try { const context = currentContext(req); assertScope(context, context.tenantId, "audit.read"); return res.json({ ok: true, logs: getDatabase().prepare("SELECT id, actor_user_id, action, resource_type, resource_id, request_id, metadata_json, created_at FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 500").all(context.tenantId) }); } catch (error) { next(error); }
  });

  return router;
}

export function platformErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction) {
  const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : undefined;
  const code = typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
  if (status && code) return res.status(status).json({ ok: false, error: code, message: error instanceof Error ? error.message : "تعذر تنفيذ الطلب." });
  return next(error);
}
