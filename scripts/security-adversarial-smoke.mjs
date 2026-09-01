#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const port = process.env.ADVERSARIAL_PORT || "4322";
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const ownsServer = !process.env.BASE_URL;
const dataDir = mkdtempSync(join(tmpdir(), "sinai-security-"));
let server;
const checks = [];
const assert = (name, condition, detail) => {
  checks.push({ name, status: condition ? "PASS" : "FAIL", detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
};
async function call(path, init = {}) {
  return fetch(new URL(path, baseUrl), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}
async function register(email, tenantName) {
  const response = await call("/api/platform/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "secure-password-123", displayName: "Security Test", tenantName }),
  });
  assert(`register ${tenantName}`, response.status === 201, `HTTP ${response.status}`);
  return response.json();
}
async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { if ((await call("/api/health")).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("adversarial server did not become healthy");
}
try {
  if (ownsServer) {
    server = spawn(process.execPath, ["dist/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        ALLOW_SQLITE_PRODUCTION_TEST: "1",
        SQLITE_PATH: join(dataDir, "security.sqlite"),
        COMMAND_CONTEXT_SECRET: "adversarial-command-secret",
        PAYMENT_WEBHOOK_SECRET: "adversarial-webhook-secret",
        CORS_ORIGINS: "http://localhost:3000",
        PORT: port,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    await waitForServer();
  }
  const a = await register("security-a@example.com", "Security A");
  const b = await register("security-b@example.com", "Security B");
  const headersA = { authorization: `Bearer ${a.token}`, "x-tenant-id": a.tenantId };
  const headersB = { authorization: `Bearer ${b.token}`, "x-tenant-id": b.tenantId };

  const idor = await call("/api/platform/products", { headers: { ...headersA, "x-tenant-id": b.tenantId } });
  assert("tenant escape / IDOR", idor.status === 403, `HTTP ${idor.status}`);
  const injection = await call("/api/platform/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "' OR 1=1 --@example.com", password: "' OR 1=1 --" }),
  });
  assert("SQL injection authentication bypass", injection.status === 401, `HTTP ${injection.status}`);
  const xss = await call("/api/platform/products", {
    method: "POST",
    headers: headersA,
    body: JSON.stringify({ businessId: a.businessId, sku: "SEC-XSS", name: "<script>alert(1)</script>", priceCents: 100 }),
  });
  assert("XSS input does not crash API", [201, 400].includes(xss.status), `HTTP ${xss.status}`);

  let rateLimited = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await call("/api/platform/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "unknown-security@example.com", password: "wrong-password" }),
    });
    if (response.status === 429) rateLimited = true;
  }
  assert("login rate-limit bypass", rateLimited, "12 rapid attempts must produce HTTP 429");

  const payload = JSON.stringify({ eventId: "security-event-001", status: "paid" });
  const validSignature = createHmac("sha256", "adversarial-webhook-secret").update(payload).digest("hex");
  const invalid = await call("/api/payments/webhook", { method: "POST", body: payload, headers: { "x-payment-signature": "bad", "x-payment-provider": "test" } });
  assert("webhook signature bypass", invalid.status === 403, `HTTP ${invalid.status}`);
  const first = await call("/api/payments/webhook", { method: "POST", body: payload, headers: { "x-payment-signature": validSignature, "x-payment-provider": "test" } });
  assert("verified webhook registration", first.status === 202, `HTTP ${first.status}`);
  const replay = await call("/api/payments/webhook", { method: "POST", body: payload, headers: { "x-payment-signature": validSignature, "x-payment-provider": "test" } });
  assert("webhook replay protection", replay.status === 200, `HTTP ${replay.status}`);
  console.log(JSON.stringify({ status: "PASS", checks }));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", checks, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  if (server) server.kill("SIGTERM");
  rmSync(dataDir, { recursive: true, force: true });
}
