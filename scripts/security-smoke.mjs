#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";

const port = process.env.SECURITY_PORT || "4321";
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;
let server;
const checks = [];
const assert = (name, condition, detail) => {
  checks.push({ name, status: condition ? "PASS" : "FAIL", detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
};

try {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
  assert("secret files are not tracked", !tracked.some(file => /(^|\/)(\.env(?!\.example$)($|\.)|.*\.pem$|.*\.key$)/i.test(file)), "no tracked secret-like files");
  assert("production env example is documented", existsSync(".env.example"), ".env.example exists");

  if (!process.env.BASE_URL) {
    server = spawn(process.execPath, ["dist/index.js"], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production", ALLOW_SQLITE_PRODUCTION_TEST: "1", COMMAND_CONTEXT_SECRET: "security-command-secret", PAYMENT_WEBHOOK_SECRET: "security-webhook-secret", PORT: port },
      stdio: ["ignore", "ignore", "ignore"],
    });
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try { if ((await fetch(new URL("/api/health", baseUrl))).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const health = await fetch(new URL("/api/health", baseUrl));
  assert("health endpoint", health.ok, `HTTP ${health.status}`);
  for (const header of ["x-content-type-options", "x-frame-options", "referrer-policy", "content-security-policy", "x-request-id"]) {
    assert(`security header ${header}`, Boolean(health.headers.get(header)), "header present");
  }
  const readiness = await fetch(new URL("/api/readiness", baseUrl));
  assert("readiness endpoint", [200, 503].includes(readiness.status), `HTTP ${readiness.status} is an allowed readiness result`);
  const body = await readiness.json();
  assert("readiness is explicit", typeof body === "object" && body !== null && typeof body.status === "string", "status is present");
  console.log(JSON.stringify({ status: "PASS", checks }));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", checks, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  if (server) server.kill("SIGTERM");
}
