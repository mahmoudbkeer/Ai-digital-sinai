#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const port = process.env.ACCEPTANCE_PORT ?? "4331";
const base = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;
const owns = !process.env.BASE_URL;
const dir = mkdtempSync(join(tmpdir(), "sinai-chain-"));
let child;
const evidence = [];
const check = (stage, response, allowed = [200, 201]) => { evidence.push({ stage, status: allowed.includes(response.status) ? "PASS" : "BLOCKED", http: response.status }); return allowed.includes(response.status); };
async function call(path, init = {}) { return fetch(new URL(path, base), { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } }); }
async function wait() { const end = Date.now() + 10000; while (Date.now() < end) { try { if ((await call("/api/health")).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error("server did not become healthy"); }
try {
  if (owns) { child = spawn(process.execPath, ["dist/index.js"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", ALLOW_SQLITE_PRODUCTION_TEST: "1", SQLITE_PATH: join(dir, "chain.sqlite"), COMMAND_CONTEXT_SECRET: "chain-command-secret", PAYMENT_WEBHOOK_SECRET: "chain-webhook-secret", CORS_ORIGINS: "http://localhost:3000", PORT: port }, stdio: "ignore" }); await wait(); }
  const registered = await call("/api/platform/auth/register", { method: "POST", body: JSON.stringify({ email: `chain-${Date.now()}@example.com`, password: "secure-password-123", displayName: "Acceptance Owner", tenantName: "Acceptance Tenant" }) });
  if (!check("identity/register", registered)) throw new Error("identity failed");
  const owner = await registered.json(); const headers = { authorization: `Bearer ${owner.token}`, "x-tenant-id": owner.tenantId };
  const me = await call("/api/platform/me", { headers }); if (!check("identity/tenant-context", me)) throw new Error("tenant context failed");
  const productResponse = await call("/api/platform/products", { method: "POST", headers, body: JSON.stringify({ businessId: owner.businessId, sku: `CHAIN-${Date.now()}`, name: "Acceptance Product", priceCents: 1000 }) });
  if (!check("business-os/products", productResponse)) throw new Error("product failed"); const product = await productResponse.json();
  const movement = await call("/api/platform/inventory/movements", { method: "POST", headers, body: JSON.stringify({ branchId: owner.branchId, productId: product.productId, quantityDelta: 2, reason: "acceptance", idempotencyKey: `chain-movement-${Date.now()}` }) });
  if (!check("inventory/atomic-movement", movement)) throw new Error("inventory failed");
  const orderResponse = await call("/api/platform/orders", { method: "POST", headers, body: JSON.stringify({ businessId: owner.businessId, branchId: owner.branchId, items: [{ productId: product.productId, quantity: 1 }] }) });
  if (!check("commerce/order-invoice-ledger", orderResponse)) throw new Error("order failed"); const order = await orderResponse.json();
  const payment = await call("/api/platform/payment-intents", { method: "POST", headers, body: JSON.stringify({ orderId: order.orderId, amountCents: order.totalCents, provider: "paymob", idempotencyKey: `chain-payment-${Date.now()}` }) });
  if (!check("payment/provider-activation", payment, [201])) throw new Error("payment route failed"); const paymentBody = await payment.json();
  if (paymentBody.status === "REQUIRES_SETUP" || paymentBody.status === "FAILED") { evidence.push({ stage: "payment/provider-activation", status: "BLOCKED_EXTERNAL_DEPENDENCY", detail: paymentBody.message }); console.log(JSON.stringify({ status: "BLOCKED_EXTERNAL_DEPENDENCY", stopAt: "payment", evidence })); process.exitCode = 78; }
  else { console.log(JSON.stringify({ status: "PASS", evidence })); }
} catch (error) { console.error(JSON.stringify({ status: "FAILED", evidence, error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; }
finally { child?.kill("SIGTERM"); rmSync(dir, { recursive: true, force: true }); }
