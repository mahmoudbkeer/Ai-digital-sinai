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
const paths = [
  { method: "GET", path: "/api/health" },
  { method: "GET", path: "/api/observability" },
  { method: "GET", path: "/api/app-data" },
  { method: "GET", path: "/api/platform/service-bookings" },
  { method: "GET", path: "/api/platform/service-availability/missing" },
  { method: "POST", path: "/api/platform/ai/search", body: { query: "load test" } },
  { method: "POST", path: "/api/platform/cart/checkout", body: {} },
];
const authHeaders = {};
if (process.env.LOAD_AUTHORIZATION) authHeaders.authorization = process.env.LOAD_AUTHORIZATION;
if (process.env.LOAD_TENANT_ID) authHeaders["x-tenant-id"] = process.env.LOAD_TENANT_ID;
let server;

async function waitForServer(child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("load server exited before becoming healthy");
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

if (ownsServer) {
  server = spawn(process.execPath, ["dist/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      ALLOW_SQLITE_PRODUCTION_TEST: "1",
      COMMAND_CONTEXT_SECRET: "load-command-secret",
      PAYMENT_WEBHOOK_SECRET: "load-webhook-secret", CORS_ORIGINS: "http://localhost:3000",
      PORT: port,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  await waitForServer(server);
}

async function worker(workerId) {
  const results = [];
  for (let index = 0; index < requestsPerWorker; index += 1) {
    const target = paths[(workerId + index) % paths.length];
    const started = performance.now();
    try {
      const response = await fetch(new URL(target.path, baseUrl), {
        method: target.method,
        headers: { "content-type": "application/json", ...authHeaders },
        body: target.body ? JSON.stringify(target.body) : undefined,
      });
      results.push({ ok: response.status < 500, status: response.status, latencyMs: performance.now() - started, path: target.path, method: target.method });
      await response.arrayBuffer();
    } catch {
      results.push({ ok: false, latencyMs: performance.now() - started, path: target.path, method: target.method });
    }
  }
  return results;
}

try {
  const batches = await Promise.all(Array.from({ length: concurrency }, (_, workerId) => worker(workerId)));
  const results = batches.flat();
  const failures = results.filter(result => !result.ok);
  const latencies = results.map(result => result.latencyMs).sort((a, b) => a - b);
  const percentile = value => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * value))] ?? 0;
  const byPath = Object.fromEntries([...new Set(results.map(result => result.path))].map(path => {
    const samples = results.filter(result => result.path === path);
    const sampleLatencies = samples.map(result => result.latencyMs).sort((a, b) => a - b);
    const percentileFor = value => sampleLatencies[Math.min(sampleLatencies.length - 1, Math.floor(sampleLatencies.length * value))] ?? 0;
    return [path, {
      requests: samples.length,
      failures: samples.filter(result => !result.ok).length,
      errorRate: samples.filter(result => !result.ok).length / Math.max(samples.length, 1),
      p50Ms: Math.round(percentileFor(0.5)),
      p95Ms: Math.round(percentileFor(0.95)),
    }];
  }));
  const summary = {
    status: failures.length || failures.length / Math.max(results.length, 1) > 0.01 ? "FAILED" : "PASS",
    baseUrl,
    requests: results.length,
    concurrency,
    failures: failures.length,
    errorRate: results.length ? failures.length / results.length : 1,
    p50Ms: Math.round(percentile(0.5)),
    p95Ms: Math.round(percentile(0.95)),
    p99Ms: Math.round(percentile(0.99)),
    byPath,
  };
  console[summary.status === "PASS" ? "log" : "error"](JSON.stringify(summary));
  if (summary.status !== "PASS") process.exitCode = 1;
} finally {
  if (server) server.kill("SIGTERM");
}
