#!/usr/bin/env node
import { spawn } from "node:child_process";

const ownsServer = !process.env.BASE_URL;
const port = process.env.LOAD_PORT || "4320";
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const concurrency = Math.min(
  Math.max(Number(process.env.LOAD_CONCURRENCY || 10), 1),
  100
);
const requestsPerWorker = Math.min(
  Math.max(Number(process.env.LOAD_REQUESTS || 20), 1),
  200
);
const runId = process.env.LOAD_RUN_ID || `${Date.now()}`;
const workloadPaths = [
  { method: "GET", path: "/api/health", expected: [200] },
  { method: "GET", path: "/api/observability", expected: [200] },
  { method: "GET", path: "/api/app-data", expected: [200] },
  { method: "GET", path: "/api/platform/service-bookings", expected: [200] },
  {
    method: "GET",
    path: "/api/platform/service-availability/missing",
    expected: [404],
  },
  {
    method: "POST",
    path: "/api/platform/ai/search",
    body: { query: "load test" },
    expected: [200],
  },
];
let server;

async function waitForServer(child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error("load server exited before becoming healthy");
    try {
      const response = await fetch(new URL("/api/health", baseUrl));
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("load server did not become healthy in time");
}

async function request(path, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { response, json, text };
}

function assertResponse(stage, result, expected) {
  if (!expected.includes(result.response.status)) {
    throw new Error(
      `${stage} returned ${result.response.status}: ${result.text.slice(0, 500)}`
    );
  }
  return result.json ?? {};
}

async function prepareWorker(workerId) {
  const suffix = `${runId}-${workerId}`;
  const registration = await request("/api/platform/auth/register", {
    method: "POST",
    body: {
      email: `load-${suffix}@example.com`,
      password: "secure-password-123",
      displayName: `Load Worker ${workerId}`,
      tenantName: `Load Tenant ${suffix}`,
    },
  });
  const identity = assertResponse("identity/register", registration, [201]);
  if (!identity.token || !identity.tenantId || !identity.businessId || !identity.branchId)
    throw new Error("identity/register did not return a complete authenticated identity");
  const headers = {
    authorization: `Bearer ${identity.token}`,
    "x-tenant-id": identity.tenantId,
  };

  const productResponse = await request("/api/platform/products", {
    method: "POST",
    headers,
    body: {
      businessId: identity.businessId,
      sku: `LOAD-${suffix}`,
      name: `Load Product ${workerId}`,
      priceCents: 1000,
    },
  });
  const product = assertResponse("product/create", productResponse, [201]);
  if (!product.productId) throw new Error("product/create did not return productId");

  const movement = await request("/api/platform/inventory/movements", {
    method: "POST",
    headers,
    body: {
      branchId: identity.branchId,
      productId: product.productId,
      quantityDelta: Math.max(2, Math.ceil(requestsPerWorker / 6)),
      reason: "authenticated-realistic-load-preparation",
      idempotencyKey: `load-movement-${suffix}`,
    },
  });
  assertResponse("inventory/seed", movement, [201]);

  const cartItem = await request("/api/platform/cart/items", {
    method: "POST",
    headers,
    body: {
      branchId: identity.branchId,
      productId: product.productId,
      quantity: 1,
    },
  });
  assertResponse("cart/prepare", cartItem, [201]);

  return {
    workerId,
    headers,
    branchId: identity.branchId,
    productId: product.productId,
  };
}

if (ownsServer) {
  server = spawn(process.execPath, ["dist/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      ALLOW_SQLITE_PRODUCTION_TEST: "1",
      COMMAND_CONTEXT_SECRET: "load-command-secret",
      PAYMENT_WEBHOOK_SECRET: "load-webhook-secret",
      CORS_ORIGINS: "http://localhost:3000",
      PORT: port,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  await waitForServer(server);
}

async function worker(workerState) {
  const results = [];
  for (let index = 0; index < requestsPerWorker; index += 1) {
    const target =
      index === 0
        ? {
            method: "POST",
            path: "/api/platform/cart/checkout",
            body: { branchId: workerState.branchId },
            expected: [201],
            businessSuccess: true,
          }
        : workloadPaths[(workerState.workerId + index - 1) % workloadPaths.length];
    const started = performance.now();
    try {
      const result = await request(target.path, {
        method: target.method,
        headers: workerState.headers,
        body: target.body,
      });
      const businessSuccess = target.businessSuccess
        ? result.response.status === 201 &&
          result.json?.ok === true &&
          typeof result.json?.orderId === "string" &&
          result.json?.state === "PENDING"
        : true;
      results.push({
        ok: target.expected.includes(result.response.status) && businessSuccess,
        status: result.response.status,
        latencyMs: performance.now() - started,
        path: target.path,
        method: target.method,
        businessSuccess,
        error: target.expected.includes(result.response.status) && businessSuccess
          ? undefined
          : result.text.slice(0, 300),
      });
    } catch (error) {
      results.push({
        ok: false,
        latencyMs: performance.now() - started,
        path: target.path,
        method: target.method,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

try {
  const workers = await Promise.all(
    Array.from({ length: concurrency }, (_, workerId) => prepareWorker(workerId))
  );
  const batches = await Promise.all(workers.map(worker));
  const results = batches.flat();
  const failures = results.filter(result => !result.ok);
  const latencies = results.map(result => result.latencyMs).sort((a, b) => a - b);
  const percentile = value =>
    latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * value))] ?? 0;
  const byPath = Object.fromEntries(
    [...new Set(results.map(result => result.path))].map(path => {
      const samples = results.filter(result => result.path === path);
      const sampleLatencies = samples.map(result => result.latencyMs).sort((a, b) => a - b);
      const percentileFor = value =>
        sampleLatencies[
          Math.min(sampleLatencies.length - 1, Math.floor(sampleLatencies.length * value))
        ] ?? 0;
      return [path, {
        requests: samples.length,
        failures: samples.filter(result => !result.ok).length,
        errorRate: samples.filter(result => !result.ok).length / Math.max(samples.length, 1),
        p50Ms: Math.round(percentileFor(0.5)),
        p95Ms: Math.round(percentileFor(0.95)),
        statuses: Object.fromEntries(
          [...new Set(samples.map(sample => sample.status).filter(Boolean))].map(status => [
            status,
            samples.filter(sample => sample.status === status).length,
          ])
        ),
      }];
    })
  );
  const checkoutResults = results.filter(result => result.path === "/api/platform/cart/checkout");
  const summary = {
    status: failures.length ? "FAILED" : "PASS",
    baseUrl,
    requests: results.length,
    concurrency,
    requestsPerWorker,
    preparedWorkers: workers.length,
    checkoutBusinessSuccesses: checkoutResults.filter(result => result.businessSuccess).length,
    checkoutBusinessFailures: checkoutResults.filter(result => !result.businessSuccess).length,
    failures: failures.length,
    errorRate: results.length ? failures.length / results.length : 1,
    p50Ms: Math.round(percentile(0.5)),
    p95Ms: Math.round(percentile(0.95)),
    p99Ms: Math.round(percentile(0.99)),
    byPath,
    failureSamples: failures.slice(0, 10),
  };
  console[summary.status === "PASS" ? "log" : "error"](JSON.stringify(summary));
  if (summary.status !== "PASS") process.exitCode = 1;
} finally {
  if (server) server.kill("SIGTERM");
}
