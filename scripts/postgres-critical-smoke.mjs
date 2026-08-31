#!/usr/bin/env node
import { spawn } from "node:child_process";

const ownsServer = !process.env.BASE_URL;
const port = process.env.STAGING_API_PORT || "4322";
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;
let server;
const request = (path, init = {}) => fetch(new URL(path, baseUrl), { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
const json = value => value.json();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const auth = identity => ({ authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId });

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try { if ((await request("/api/health")).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("staging API did not become healthy");
}
async function register(label) {
  const response = await request("/api/platform/auth/register", { method: "POST", body: JSON.stringify({ email: `staging-${label}-${Date.now()}@example.com`, password: "secure-password-123", displayName: "Staging Test", tenantName: `Staging ${label}` }) });
  assert(response.status === 201, `register ${label} returned ${response.status}`);
  return json(response);
}

try {
  assert(/^(postgres|postgresql):\/\//i.test(process.env.DATABASE_URL ?? ""), "DATABASE_URL must be PostgreSQL");
  if (ownsServer) {
    server = spawn(process.execPath, ["dist/index.js"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "staging", PORT: port, COMMAND_CONTEXT_SECRET: process.env.COMMAND_CONTEXT_SECRET ?? "staging-command-secret", PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET ?? "staging-webhook-secret" }, stdio: ["ignore", "ignore", "ignore"] });
    await waitForServer();
  }
  const a = await register("a");
  const b = await register("b");
  const headersA = auth(a);
  const headersB = auth(b);

  const tampered = await request("/api/platform/products", { headers: { ...headersA, "x-tenant-id": b.tenantId } });
  assert(tampered.status === 403, `tenant tampering returned ${tampered.status}`);

  const productResponse = await request("/api/platform/products", { method: "POST", headers: headersA, body: JSON.stringify({ businessId: a.businessId, sku: `PG-${Date.now()}`, name: "PostgreSQL product", priceCents: 1250 }) });
  assert(productResponse.status === 201, `product returned ${productResponse.status}`);
  const { productId } = await json(productResponse);
  const movement = await request("/api/platform/inventory/movements", { method: "POST", headers: headersA, body: JSON.stringify({ branchId: a.branchId, productId, quantityDelta: 5, reason: "staging", idempotencyKey: `pg-movement-${Date.now()}` }) });
  assert(movement.status === 201, `inventory movement returned ${movement.status}`);
  const order = await request("/api/platform/orders", { method: "POST", headers: headersA, body: JSON.stringify({ businessId: a.businessId, branchId: a.branchId, items: [{ productId, quantity: 1 }] }) });
  assert(order.status === 201, `order returned ${order.status}`);
  const orderBody = await json(order);
  assert(orderBody.totalCents === 1250 && orderBody.state === "PENDING", "order totals/state are invalid");

  const crossTenantSearch = await request("/api/platform/ai/search", { method: "POST", headers: headersB, body: JSON.stringify({ query: "PostgreSQL product" }) });
  assert(crossTenantSearch.status === 200, `cross tenant search returned ${crossTenantSearch.status}`);
  assert((await json(crossTenantSearch)).results.length === 0, "cross tenant search leaked data");

  const payment = await request("/api/platform/payment-intents", { method: "POST", headers: headersA, body: JSON.stringify({ amountCents: 1250, provider: "paymob", idempotencyKey: `pg-payment-${Date.now()}` }) });
  assert(payment.status === 201 && (await json(payment)).status === "REQUIRES_SETUP", "payment provider reported false success");
  console.log(JSON.stringify({ status: "PASS", provider: "postgresql", checks: ["identity", "tenant tampering", "inventory", "order", "cross-tenant AI search", "payment setup boundary"] }));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", provider: "postgresql", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  if (server) server.kill("SIGTERM");
}
