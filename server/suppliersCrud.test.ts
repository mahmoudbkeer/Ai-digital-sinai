import { createServer, type Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlatformRouter, platformErrorHandler } from "./platform";
import { resetDatabaseForTests } from "./database";
import { getDataPlane } from "./dataPlane";

let server: Server;
let baseUrl = "";
async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
}
async function register(email: string, tenantName: string) {
  const response = await request("/api/platform/auth/register", { method: "POST", body: JSON.stringify({ email, password: "secure-password-123", displayName: "Suppliers Owner", tenantName }) });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ token: string; tenantId: string; businessId: string }>;
}
const auth = (identity: { token: string; tenantId: string }) => ({ authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId });

beforeAll(async () => {
  process.env.SQLITE_PATH = ":memory:";
  const app = express(); app.use(express.json()); app.use("/api/platform", createPlatformRouter()); app.use(platformErrorHandler);
  server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("server failed"); baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(() => { server.close(); resetDatabaseForTests(); });

describe("Suppliers operational contract", () => {
  it("returns supplier context, procurement history and audit without cross-tenant access", async () => {
    expect((await request("/api/platform/suppliers")).status).toBe(401);
    const tenantA = await register(`suppliers-a-${Date.now()}@example.test`, "Suppliers A");
    const tenantB = await register(`suppliers-b-${Date.now()}@example.test`, "Suppliers B");
    const created = await request("/api/platform/suppliers", { method: "POST", headers: auth(tenantA), body: JSON.stringify({ businessId: tenantA.businessId, name: "مورد اختبار حقيقي", phone: "01012345678", email: "supplier@example.test" }) });
    expect(created.status).toBe(201);
    const { supplierId } = await created.json() as { supplierId: string };
    const listA = await request("/api/platform/suppliers", { headers: auth(tenantA) });
    await expect(listA.json()).resolves.toMatchObject({ suppliers: [expect.objectContaining({ id: supplierId, name: "مورد اختبار حقيقي" })] });
    const historyA = await request(`/api/platform/suppliers/${supplierId}/history`, { headers: auth(tenantA) });
    expect(historyA.status).toBe(200);
    await expect(historyA.json()).resolves.toMatchObject({ supplier: { id: supplierId }, purchases: [], audit: [expect.objectContaining({ action: "supplier.create" })] });
    expect((await request(`/api/platform/suppliers/${supplierId}/history`, { headers: auth(tenantB) })).status).toBe(404);
    expect((await request("/api/platform/suppliers", { method: "POST", headers: auth(tenantB), body: JSON.stringify({ businessId: tenantA.businessId, name: "اختراق" }) })).status).toBe(404);
    const audit = await getDataPlane().prepare("SELECT action FROM audit_logs WHERE tenant_id = ? AND resource_id = ?").all(tenantA.tenantId, supplierId) as Array<{ action: string }>;
    expect(audit.map(row => row.action)).toContain("supplier.create");
  });
});
