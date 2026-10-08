#!/usr/bin/env node
import { Pool } from "pg";
import { spawn } from "node:child_process";

const ownsServer = !process.env.BASE_URL;
const port = process.env.STAGING_API_PORT || "4322";
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;
let server;
let serverListenObserved = false;
let serverExit;
const sensitiveValues = [
  process.env.DATABASE_URL,
  process.env.COMMAND_CONTEXT_SECRET,
  process.env.PAYMENT_WEBHOOK_SECRET,
  process.env.BACKUP_ENCRYPTION_KEY,
].filter(value => value && value.length >= 4);
const redact = value => {
  let safe = String(value ?? "");
  safe = safe.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_POSTGRES_URL]");
  for (const secret of sensitiveValues) safe = safe.split(secret).join("[REDACTED_SECRET]");
  return safe;
};
const logDiagnostic = (event, details = {}) => console.log(JSON.stringify({ event, ...details, ...(details.message ? { message: redact(details.message) } : {}) }));
const request = (path, init = {}) => fetch(new URL(path, baseUrl), { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
const json = value => value.json();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const auth = identity => ({ authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId });

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  let lastHealthFailure = "no health request completed";
  let loggedFirstFailure = false;
  while (Date.now() < deadline) {
    if (serverExit) {
      lastHealthFailure = `process exited code=${serverExit.code ?? "null"} signal=${serverExit.signal ?? "null"}`;
      break;
    }
    try {
      const response = await request("/api/health");
      const body = redact(await response.text());
      if (response.ok) {
        logDiagnostic("api_health", { status: response.status, body });
        return;
      }
      lastHealthFailure = `HTTP ${response.status}; body=${body}`;
      if (!loggedFirstFailure) {
        logDiagnostic("api_health_failure", { status: response.status, body });
        loggedFirstFailure = true;
      }
    } catch (error) {
      lastHealthFailure = error instanceof Error ? redact(error.message) : redact(String(error));
      if (!loggedFirstFailure) {
        logDiagnostic("api_health_error", { message: lastHealthFailure });
        loggedFirstFailure = true;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  logDiagnostic("api_health_timeout", { lastResult: redact(lastHealthFailure), serverListenObserved, processExited: Boolean(serverExit) });
  throw new Error(`staging API did not become healthy; last health result: ${redact(lastHealthFailure)}`);
}
async function register(label) {
  const email = `staging-${label}-${Date.now()}@example.com`;
  const response = await request("/api/platform/auth/register", { method: "POST", body: JSON.stringify({ email, password: "secure-password-123", displayName: "Staging Test", tenantName: `Staging ${label}` }) });
  assert(response.status === 201, `register ${label} returned ${response.status}`);
  const created = await json(response);
  assert(!created.token, `register ${label} issued an authenticated session`);
  const fixturePool = new Pool({ connectionString: process.env.DATABASE_URL, onConnect: async client => { await client.query("SET search_path TO public"); }, ssl: process.env.PG_SSL === "require" ? { rejectUnauthorized: true } : undefined });
  try {
    await fixturePool.query("UPDATE users SET status = 'active' WHERE id = $1", [created.userId]);
  } finally { await fixturePool.end(); }
  const login = await request("/api/platform/auth/login", { method: "POST", body: JSON.stringify({ email, password: "secure-password-123" }) });
  assert(login.status === 200, `login ${label} returned ${login.status}`);
  return { ...created, ...(await json(login)) };
}

try {
  assert(/^(postgres|postgresql):\/\//i.test(process.env.DATABASE_URL ?? ""), "DATABASE_URL must be PostgreSQL");
  if (ownsServer) {
    server = spawn(process.execPath, ["dist/index.js"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "staging", PORT: port, COMMAND_CONTEXT_SECRET: process.env.COMMAND_CONTEXT_SECRET ?? "staging-command-secret", PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET ?? "staging-webhook-secret" }, stdio: ["ignore", "pipe", "pipe"] });
    logDiagnostic("api_process_started", { pid: server.pid, command: "node dist/index.js", port, healthUrl: baseUrl + "/api/health" });
    for (const [streamName, stream] of [["stdout", server.stdout], ["stderr", server.stderr]]) {
      stream.setEncoding("utf8");
      let pending = "";
      stream.on("data", chunk => {
        pending += chunk;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const message = redact(line);
          if (message.includes("Server running on http://localhost:")) serverListenObserved = true;
          logDiagnostic(`api_${streamName}`, { message });
        }
      });
      stream.on("end", () => {
        if (pending) logDiagnostic(`api_${streamName}`, { message: redact(pending) });
      });
    }
    server.on("error", error => logDiagnostic("api_process_error", { message: error instanceof Error ? error.message : String(error) }));
    server.on("exit", (code, signal) => {
      serverExit = { code, signal };
      logDiagnostic("api_process_exit", { code, signal, serverListenObserved });
    });
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

  const paymentKey = `pg-payment-${Date.now()}`;
  const payment = await request("/api/platform/payment-intents", { method: "POST", headers: headersA, body: JSON.stringify({ orderId: orderBody.orderId, amountCents: 1250, provider: "paymob", idempotencyKey: paymentKey }) });
  const paymentBody = await json(payment);
  assert(payment.status === 201 && paymentBody.status === "REQUIRES_SETUP", "payment provider reported false success");
  const paymentReplay = await request("/api/platform/payment-intents", { method: "POST", headers: headersA, body: JSON.stringify({ orderId: orderBody.orderId, amountCents: 1250, provider: "paymob", idempotencyKey: paymentKey }) });
  const paymentReplayBody = await json(paymentReplay);
  assert(paymentReplay.status === 200 && paymentReplayBody.replay === true && paymentReplayBody.paymentIntentId === paymentBody.paymentIntentId, "idempotent payment replay created a duplicate");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, onConnect: async client => { await client.query("SET search_path TO public"); }, ssl: process.env.PG_SSL === "require" ? { rejectUnauthorized: true } : undefined });
  try {
    const financial = await pool.query("SELECT COALESCE(SUM(debit_cents), 0)::bigint AS debit, COALESCE(SUM(credit_cents), 0)::bigint AS credit FROM ledger_entries WHERE tenant_id = $1", [a.tenantId]);
    const debit = Number(financial.rows[0].debit);
    const credit = Number(financial.rows[0].credit);
    assert(debit === credit, `ledger imbalance debit=${debit} credit=${credit}`);
    const invoice = await pool.query("SELECT COUNT(*)::int AS count FROM invoices WHERE tenant_id = $1 AND order_id = $2", [a.tenantId, orderBody.orderId]);
    assert(Number(invoice.rows[0].count) === 1, `expected one invoice for order, got ${invoice.rows[0].count}`);
    const journals = await pool.query("SELECT COUNT(*)::int AS unbalanced FROM (SELECT j.id FROM ledger_journals j JOIN ledger_entries e ON e.tenant_id = j.tenant_id AND e.journal_id = j.id WHERE j.tenant_id = $1 GROUP BY j.id HAVING COALESCE(SUM(e.debit_cents), 0) <> COALESCE(SUM(e.credit_cents), 0)) q", [a.tenantId]);
    assert(Number(journals.rows[0].unbalanced) === 0, `unbalanced journals=${journals.rows[0].unbalanced}`);
    console.log(JSON.stringify({ status: "PASS", provider: "postgresql", financial: { debitCents: debit, creditCents: credit, balanced: true, invoiceCountForOrder: Number(invoice.rows[0].count), unbalancedJournals: Number(journals.rows[0].unbalanced) }, checks: ["identity", "tenant tampering", "inventory", "order", "idempotent payment replay", "invoice", "balanced ledger", "cross-tenant AI search", "payment setup boundary"] }));
  } finally {
    await pool.end();
  }
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", provider: "postgresql", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  if (server) server.kill("SIGTERM");
}
