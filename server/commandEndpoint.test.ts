import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { signCommandContext } from "./commandAuth";

const port = 4500 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const secret = "endpoint-command-context-secret";
let serverProcess: ChildProcess;
let serverErrorLogs = "";

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start");
}

async function prepare(headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}/api/commands/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ sectorId: "retail", moduleId: "retail-catalog", operationId: "retail-publish" }),
  });
}

describe("command prepare endpoint authorization", () => {
  beforeAll(async () => {
    serverProcess = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production", PORT: String(port), COMMAND_CONTEXT_SECRET: secret },
      stdio: ["ignore", "ignore", "pipe"],
    });
    serverProcess.stderr?.on("data", (chunk: Buffer) => { serverErrorLogs += chunk.toString(); });
    await waitForServer();
  });

  afterAll(() => serverProcess.kill("SIGTERM"));

  it("sets security headers and a request ID in production", async () => {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { "x-request-id": "test-request-001" } });
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-request-id")).toBe("test-request-001");
  });

  it("logs HTTP errors safely without sensitive headers", async () => {
    const response = await fetch(`${baseUrl}/api/commands/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "error-request-001", Authorization: "Bearer do-not-log", Cookie: "session=do-not-log" },
      body: "{",
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "internal-error", requestId: "error-request-001" });
    for (let attempt = 0; attempt < 20 && !serverErrorLogs.includes('"event":"http_error"'); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
    expect(serverErrorLogs).toContain('"requestId":"error-request-001"');
    expect(serverErrorLogs).toContain('"path":"/api/commands/prepare"');
    expect(serverErrorLogs).not.toContain("Authorization");
    expect(serverErrorLogs).not.toContain("Cookie");
    expect(serverErrorLogs).not.toContain("do-not-log");
  });

  it("returns 401 when the signed command context is absent", async () => {
    const response = await prepare();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ status: "requires-auth" });
  });

  it("returns 403 when user or workspace changes without a new signature", async () => {
    const signature = signCommandContext({ userId: "user-a", workspaceId: "workspace-a" }, secret);
    const response = await prepare({
      "x-command-user": "user-a",
      "x-workspace-id": "workspace-b",
      "x-command-context-signature": signature,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ status: "invalid-context" });
  });
});
