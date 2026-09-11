#!/usr/bin/env node
import { Pool } from "pg";
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
  const orderKey = `pg-order-${Date.now()}`;
  const order = await request("/api/platform/orders", { method: "POST", headers: headersA, body: JSON.stringify({ businessId: a.businessId, branchId: a.branchId, idempotencyKey: orderKey, items: [{ productId, quantity: 1 }] }) });
  assert(order.status === 201, `order returned ${order.status}`);
  const orderBody = await json(order);
  assert(orderBody.totalCents === 1250 && orderBody.state === "PENDING", "order totals/state are invalid");
  const duplicateOrder = await request("/api/platform/orders", { method: "POST", headers: headersA, body: JSON.stringify({ businessId: a.businessId, branchId: a.branchId, idempotencyKey: orderKey, items: [{ productId, quantity: 1 }] }) });
  assert(duplicateOrder.status === 201, `idempotent order replay returned ${duplicateOrder.status}`);
  const duplicateOrderBody = await json(duplicateOrder);
  assert(duplicateOrderBody.orderId === orderBody.orderId, "idempotent order replay created a duplicate");

  const crossTenantSearch = await request("/api/platform/ai/search", { method: "POST", headers: headersB, body: JSON.stringify({ query: "PostgreSQL product" }) });
  assert(crossTenantSearch.status === 200, `cross tenant search returned ${crossTenantSearch.status}`);
  assert((await json(crossTenantSearch)).results.length === 0, "cross tenant search leaked data");

  const payment = await request("/api/platform/payment-intents", { method: "POST", headers: headersA, body: JSON.stringify({ amountCents: 1250, provider: "paymob", idempotencyKey: `pg-payment-${Date.now()}` }) });
  assert(payment.status === 201 && (await json(payment)).status === "REQUIRES_SETUP", "payment provider reported false success");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PG_SSL === "require" ? { rejectUnauthorized: true } : undefined });
  try {
    const financial = await pool.query("SELECT COALESCE(SUM(debit_cents), 0)::bigint AS debit, COALESCE(SUM(credit_cents), 0)::bigint AS credit FROM ledger_entries WHERE tenant_id = $1", [a.tenantId]);
    const debit = Number(financial.rows[0].debit);
    const credit = Number(financial.rows[0].credit);
    assert(debit === credit, `ledger imbalance debit=${debit} credit=${credit}`);
    const invoice = await pool.query("SELECT COUNT(*)::int AS count FROM invoices WHERE tenant_id = $1 AND order_id = $2", [a.tenantId, orderBody.orderId]);
    assert(Number(invoice.rows[0].count) === 1, `expected one invoice for order, got ${invoice.rows[0].count}`);
    const journals = await pool.query("SELECT COUNT(*)::int AS unbalanced FROM (SELECT j.id FROM ledger_journals j JOIN ledger_entries e ON e.tenant_id = j.tenant_id AND e.journal_id = j.id WHERE j.tenant_id = $1 GROUP BY j.id HAVING COALESCE(SUM(e.debit_cents), 0) <> COALESCE(SUM(e.credit_cents), 0)) q", [a.tenantId]);
    assert(Number(journals.rows[0].unbalanced) === 0, `unbalanced journals=${journals.rows[0].unbalanced}`);
    console.log(JSON.stringify({ status: "PASS", provider: "postgresql", financial: { debitCents: debit, creditCents: credit, balanced: true, invoiceCountForOrder: Number(invoice.rows[0].count), unbalancedJournals: Number(journals.rows[0].unbalanced) }, checks: ["identity", "tenant tampering", "inventory", "order", "idempotent order replay", "invoice", "balanced ledger", "cross-tenant AI search", "payment setup boundary"] }));
  } finally {
    await pool.end();
  }
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", provider: "postgresql", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  if (server) server.kill("SIGTERM");
}
