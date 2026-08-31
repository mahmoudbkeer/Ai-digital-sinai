import { createHmac } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = 4900 + Math.floor(Math.random() * 100);
const baseUrl = `http://127.0.0.1:${port}`;
const secret = "webhook-integration-secret";
const dbPath = `/tmp/ai-sinai-webhook-${process.pid}.sqlite`;
let serverProcess: ChildProcess;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch { /* process is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Webhook test server did not start");
}
function signed(payload: string) { return createHmac("sha256", secret).update(payload).digest("hex"); }
async function post(payload: string) {
  return fetch(`${baseUrl}/api/payments/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-payment-provider": "paymob", "x-payment-signature": signed(payload) }, body: payload });
}

describe("payment webhook persistence", () => {
  beforeAll(async () => {
    rmSync(dbPath, { force: true });
    serverProcess = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", PORT: String(port), PAYMENT_WEBHOOK_SECRET: secret, COMMAND_CONTEXT_SECRET: "command-secret", SQLITE_PATH: dbPath }, stdio: ["ignore", "ignore", "ignore"] });
    await waitForServer();
  });
  afterAll(() => { serverProcess.kill("SIGTERM"); rmSync(dbPath, { force: true }); });

  it("verifies and persists the first event", async () => {
    const response = await post(JSON.stringify({ id: "evt-001", event: "payment.updated" }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ accepted: true, status: "verified-pending", eventId: "evt-001" });
  });

  it("returns an idempotent replay and rejects a changed payload", async () => {
    const replay = await post(JSON.stringify({ id: "evt-001", event: "payment.updated" }));
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ duplicate: true });
    const conflict = await post(JSON.stringify({ id: "evt-001", event: "payment.failed" }));
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ status: "webhook-replay-conflict" });
  });
});
