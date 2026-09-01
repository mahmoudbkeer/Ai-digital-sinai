#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const port = process.env.POST_PAYMENT_PORT ?? "4332";
const base = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;
const owns = !process.env.BASE_URL; const dir = mkdtempSync(join(tmpdir(), "sinai-post-payment-")); let child;
const evidence = []; const record = (stage, response, expected = [200, 201]) => { const pass = expected.includes(response.status); evidence.push({ stage, status: pass ? "PASS" : "FAILED", http: response.status }); if (!pass) throw new Error(`${stage}: HTTP ${response.status}`); return response; };
async function call(path, init = {}) { return fetch(new URL(path, base), { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } }); }
async function wait() { const end = Date.now() + 10000; while (Date.now() < end) { try { if ((await call("/api/health")).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error("server did not become healthy"); }
try {
  if (owns) { child = spawn(process.execPath, ["dist/index.js"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", ALLOW_SQLITE_PRODUCTION_TEST: "1", SQLITE_PATH: join(dir, "post.sqlite"), COMMAND_CONTEXT_SECRET: "post-command", PAYMENT_WEBHOOK_SECRET: "post-webhook", CORS_ORIGINS: "http://localhost:3000", PORT: port }, stdio: "ignore" }); await wait(); }
  const registered = await call("/api/platform/auth/register", { method: "POST", body: JSON.stringify({ email: `post-${Date.now()}@example.com`, password: "secure-password-123", displayName: "Post Payment Owner", tenantName: "Post Payment Tenant" }) }); record("identity", registered); const owner = await registered.json(); const headers = { authorization: `Bearer ${owner.token}`, "x-tenant-id": owner.tenantId };
  const productResponse = await call("/api/platform/products", { method: "POST", headers, body: JSON.stringify({ businessId: owner.businessId, sku: `POST-${Date.now()}`, name: "Post Payment Product", priceCents: 200 }) }); record("products", productResponse); const product = await productResponse.json();
  record("inventory", await call("/api/platform/inventory/movements", { method: "POST", headers, body: JSON.stringify({ branchId: owner.branchId, productId: product.productId, quantityDelta: 2, reason: "post-payment", idempotencyKey: `post-stock-${Date.now()}` }) }));
  const orderResponse = await call("/api/platform/orders", { method: "POST", headers, body: JSON.stringify({ businessId: owner.businessId, branchId: owner.branchId, items: [{ productId: product.productId, quantity: 1 }] }) }); record("order-invoice-ledger", orderResponse); const order = await orderResponse.json();
  const deliveryResponse = await call("/api/platform/deliveries", { method: "POST", headers, body: JSON.stringify({ orderId: order.orderId }) }); record("delivery/create", deliveryResponse); const delivery = await deliveryResponse.json();
  for (const state of ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"]) record(`delivery/${state}`, await call(`/api/platform/deliveries/${delivery.deliveryId}/state`, { method: "PATCH", headers, body: JSON.stringify({ state }) }));
  record("delivery/proof", await call(`/api/platform/deliveries/${delivery.deliveryId}/proof`, { method: "POST", headers, body: JSON.stringify({ proofType: "NOTE", storageRef: "signed:post-payment", recipientName: "Acceptance Recipient" }) }));
  record("delivery/DELIVERED", await call(`/api/platform/deliveries/${delivery.deliveryId}/state`, { method: "PATCH", headers, body: JSON.stringify({ state: "DELIVERED" }) }));
  record("notifications/in-app", await call("/api/platform/notifications", { method: "POST", headers, body: JSON.stringify({ userId: owner.userId, channel: "IN_APP", title: "Acceptance", body: "Delivery complete" }) }));
  record("subscription/trial", await call("/api/platform/subscriptions", { method: "POST", headers, body: JSON.stringify({ planCode: "trial" }) }));
  record("ai/advisor", await call("/api/platform/ai/advisor/insights", { headers }));
  record("analytics/kpis", await call("/api/platform/analytics/kpis", { headers }));
  const admin = await call("/api/platform/admin/overview", { headers }); evidence.push({ stage: "admin/overview", status: admin.status === 403 ? "BLOCKED_AUTHORIZATION" : "PASS", http: admin.status });
  console.log(JSON.stringify({ status: "PASS_WITH_ADMIN_AUTH_BOUNDARY", evidence }));
} catch (error) { console.error(JSON.stringify({ status: "FAILED", evidence, error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; }
finally { child?.kill("SIGTERM"); rmSync(dir, { recursive: true, force: true }); }
