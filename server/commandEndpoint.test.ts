import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { signCommandContext } from "./commandAuth";

const port = 4500 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const secret = "endpoint-command-context-secret";
let serverProcess: ChildProcess;

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
      env: { ...process.env, NODE_ENV: "test", PORT: String(port), COMMAND_CONTEXT_SECRET: secret },
      stdio: "ignore",
    });
    await waitForServer();
  });

  afterAll(() => serverProcess.kill("SIGTERM"));

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
