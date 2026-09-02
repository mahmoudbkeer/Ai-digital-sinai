import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const port = process.env.ACCEPTANCE_PORT ?? "4332";
const base = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;
const ownsServer = !process.env.BASE_URL;
const dir = mkdtempSync(join(tmpdir(), "sinai-web-acceptance-"));
const dbPath = join(dir, "acceptance.sqlite");
const evidence = [];
let server;
let browser;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitHealthy() {
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error("server did not become healthy");
}
function db() { return new DatabaseSync(dbPath); }
function snapshot(ids = {}) {
  const d = db();
  const q = (sql, ...args) => d.prepare(sql).get(...args) ?? {};
  const out = {
    users: Number(q("SELECT COUNT(*) AS n FROM users").n ?? 0),
    tenants: Number(q("SELECT COUNT(*) AS n FROM tenants").n ?? 0),
    businesses: Number(q("SELECT COUNT(*) AS n FROM businesses").n ?? 0),
    products: Number(q("SELECT COUNT(*) AS n FROM products").n ?? 0),
    carts: Number(q("SELECT COUNT(*) AS n FROM carts").n ?? 0),
    cartItems: Number(q("SELECT COUNT(*) AS n FROM cart_items").n ?? 0),
    orders: Number(q("SELECT COUNT(*) AS n FROM orders").n ?? 0),
    payments: Number(q("SELECT COUNT(*) AS n FROM payment_intents").n ?? 0),
    deliveries: Number(q("SELECT COUNT(*) AS n FROM deliveries").n ?? 0),
    proofs: Number(q("SELECT COUNT(*) AS n FROM delivery_proofs").n ?? 0),
    notifications: Number(q("SELECT COUNT(*) AS n FROM notifications").n ?? 0),
    notificationDeliveries: Number(q("SELECT COUNT(*) AS n FROM notification_deliveries").n ?? 0),
    subscriptions: Number(q("SELECT COUNT(*) AS n FROM subscriptions").n ?? 0),
    audits: Number(q("SELECT COUNT(*) AS n FROM audit_logs").n ?? 0),
  };
  if (ids.orderId) out.order = q("SELECT id, state, total_cents FROM orders WHERE id = ?", ids.orderId);
  if (ids.paymentId) out.payment = q("SELECT id, status, amount_cents FROM payment_intents WHERE id = ?", ids.paymentId);
  if (ids.deliveryId) out.delivery = q("SELECT id, state FROM deliveries WHERE id = ?", ids.deliveryId);
  if (ids.notificationId) out.notification = q("SELECT id, channel, user_id FROM notifications WHERE id = ?", ids.notificationId);
  if (ids.subscriptionId) out.subscription = q("SELECT id, plan_code, status, cancel_at_period_end FROM subscriptions WHERE id = ?", ids.subscriptionId);
  d.close();
  return out;
}
function record(step, method, endpoint, status, body, before, ids = {}) {
  const after = snapshot(ids);
  evidence.push({ step, method, endpoint, httpStatus: status, response: body, dbBefore: before, dbAfter: after });
  if (![200, 201, 202].includes(status)) throw new Error(`${step}: HTTP ${status} ${JSON.stringify(body)}`);
  return body;
}

try {
  if (ownsServer) {
    server = spawn(process.execPath, ["dist/index.js"], { cwd: root, env: { ...process.env, NODE_ENV: "production", ALLOW_SQLITE_PRODUCTION_TEST: "1", SQLITE_PATH: dbPath, PORT: port, COMMAND_CONTEXT_SECRET: "web-acceptance", PAYMENT_WEBHOOK_SECRET: "web-acceptance", CORS_ORIGINS: base }, stdio: "ignore" });
    await waitHealthy();
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "networkidle" });

  const result = await page.evaluate(async () => {
    const out = [];
    const call = async (method, endpoint, body, auth) => {
      const r = await fetch(endpoint, { method, headers: { "Content-Type": "application/json", ...(auth ? { authorization: `Bearer ${auth.token}`, "x-tenant-id": auth.tenantId } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      let payload = null; try { payload = await r.json(); } catch { payload = { text: await r.text() }; }
      out.push({ method, endpoint, status: r.status, body: payload });
      return { status: r.status, body: payload };
    };
    const email = `web-full-${Date.now()}@example.test`; const password = "secure-password-123";
    const registered = await call("POST", "/api/platform/auth/register", { email, password, displayName: "Web Full Acceptance", tenantName: "Web Full Tenant" });
    const owner = registered.body;
    const auth = { token: owner.token, tenantId: owner.tenantId };
    await call("POST", "/api/platform/auth/login", { email, password });
    await call("GET", "/api/platform/me", undefined, auth);
    const product = await call("POST", "/api/platform/products", { businessId: owner.businessId, sku: `WEB-${Date.now()}`, name: "Web Acceptance Product", description: "real browser acceptance", priceCents: 1250, category: "local" }, auth);
    const productId = product.body.productId;
    await call("GET", "/api/platform/products", undefined, auth);
    await call("GET", `/api/platform/products/${productId}`, undefined, auth);
    await call("POST", "/api/platform/inventory/movements", { branchId: owner.branchId, productId, quantityDelta: 3, reason: "web-acceptance", idempotencyKey: `web-stock-${Date.now()}` }, auth);
    await call("GET", "/api/platform/cart", undefined, auth);
    await call("POST", "/api/platform/cart/items", { productId, quantity: 1, branchId: owner.branchId }, auth);
    await call("GET", "/api/platform/cart", undefined, auth);
    const checkout = await call("POST", "/api/platform/cart/checkout", { branchId: owner.branchId }, auth);
    const orderId = checkout.body.orderId;
    await call("GET", "/api/platform/orders", undefined, auth);
    const payment = await call("POST", "/api/platform/payment-intents", { orderId, amountCents: checkout.body.totalCents ?? 1250, provider: "paymob", idempotencyKey: `web-payment-${Date.now()}` }, auth);
    const driver = await call("POST", "/api/platform/drivers", { userId: owner.userId, licenseNumber: `WEB-${Date.now()}` }, auth);
    const delivery = await call("POST", "/api/platform/deliveries", { orderId, driverId: driver.body.driverId }, auth);
    const deliveryId = delivery.body.deliveryId;
    await call("POST", `/api/platform/deliveries/${deliveryId}/accept`, undefined, auth);
    await call("PATCH", `/api/platform/deliveries/${deliveryId}/state`, { state: "PICKED_UP" }, auth);
    await call("PATCH", `/api/platform/deliveries/${deliveryId}/state`, { state: "IN_TRANSIT" }, auth);
    await call("POST", `/api/platform/deliveries/${deliveryId}/proof`, { proofType: "SIGNATURE", storageRef: "local:web-acceptance-proof", recipientName: "Web Recipient" }, auth);
    await call("PATCH", `/api/platform/deliveries/${deliveryId}/state`, { state: "DELIVERED" }, auth);
    const notification = await call("POST", "/api/platform/notifications", { userId: owner.userId, channel: "IN_APP", title: "Order delivered", body: `Order ${orderId} delivered` }, auth);
    await call("GET", "/api/platform/notifications", undefined, auth);
    const subscription = await call("POST", "/api/platform/subscriptions", { planCode: "trial" }, auth);
    await call("GET", "/api/platform/subscription", undefined, auth);
    await call("GET", "/api/platform/subscription/entitlements", undefined, auth);
    await call("POST", "/api/platform/ai/search", { query: "Web Acceptance Product" }, auth);
    await call("GET", "/api/platform/analytics/overview", undefined, auth);
    await call("GET", "/api/platform/analytics/kpis", undefined, auth);
    return { owner, productId, orderId, paymentId: payment.body.paymentIntentId, deliveryId, notificationId: notification.body.notificationId, subscriptionId: subscription.body.subscriptionId, requests: out };
  });
  const ids = result;
  let previous = snapshot();
  for (const request of result.requests) {
    const relevant = { orderId: ids.orderId, paymentId: ids.paymentId, deliveryId: ids.deliveryId, notificationId: ids.notificationId, subscriptionId: ids.subscriptionId };
    const after = snapshot(relevant);
    evidence.push({ step: request.endpoint, method: request.method, endpoint: request.endpoint, httpStatus: request.status, response: request.body, dbBefore: previous, dbAfter: after });
    if (![200, 201, 202].includes(request.status)) throw new Error(`${request.method} ${request.endpoint}: HTTP ${request.status} ${JSON.stringify(request.body)}`);
    previous = after;
  }
  const finalDb = snapshot(ids);
  const paymentEvidence = evidence.find((x) => x.endpoint === "/api/platform/payment-intents");
  if (paymentEvidence?.response?.status !== "REQUIRES_SETUP") throw new Error("payment boundary was not REQUIRES_SETUP");
  if (finalDb.order?.state !== "COMPLETED") throw new Error(`order did not complete: ${finalDb.order?.state}`);
  await browser.close();
  browser = undefined;
  console.log(JSON.stringify({ status: "PASS", browserSession: "one Playwright browser context", ids, finalDb, evidence }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", error: error instanceof Error ? error.message : String(error), evidence }, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  server?.kill("SIGTERM");
  rmSync(dir, { recursive: true, force: true });
}
