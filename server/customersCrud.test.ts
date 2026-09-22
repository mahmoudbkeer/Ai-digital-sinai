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
  const response = await request("/api/platform/auth/register", { method: "POST", body: JSON.stringify({ email, password: "secure-password-123", displayName: "Customers Owner", tenantName }) });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ token: string; tenantId: string; businessId: string; userId: string }>;
}
const auth = (identity: { token: string; tenantId: string }) => ({ authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId });

beforeAll(async () => {
  process.env.SQLITE_PATH = ":memory:";
  const app = express(); app.use(express.json()); app.use("/api/platform", createPlatformRouter()); app.use(platformErrorHandler);
  server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("server failed"); baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(() => { server.close(); resetDatabaseForTests(); });

describe("Customers operational flow", () => {
  it("lists, creates, searches, loads history, adds interaction and tag with audit", async () => {
    const identity = await register(`customers-${Date.now()}@example.com`, "Customers Tenant");
    const headers = auth(identity);
    const created = await request("/api/platform/customers", { method: "POST", headers, body: JSON.stringify({ name: "عميل حقيقي", phone: "01012345678", email: "customer@example.test" }) });
    expect(created.status).toBe(201);
    const { customerId } = await created.json() as { customerId: string };
    const list = await request("/api/platform/customers?query=حقيقي", { headers });
    await expect(list.json()).resolves.toMatchObject({ customers: [expect.objectContaining({ id: customerId, name: "عميل حقيقي", email: "customer@example.test" })] });
    const interaction = await request(`/api/platform/customers/${customerId}/interactions`, { method: "POST", headers, body: JSON.stringify({ interactionType: "CALL", note: "متابعة حقيقية" }) });
    expect(interaction.status).toBe(201);
    const tag = await request(`/api/platform/customers/${customerId}/tags`, { method: "POST", headers, body: JSON.stringify({ name: "مهم" }) });
    expect(tag.status).toBe(201);
    const history = await request(`/api/platform/customers/${customerId}/history`, { headers });
    await expect(history.json()).resolves.toMatchObject({ customer: expect.objectContaining({ id: customerId }), interactions: [expect.objectContaining({ note: "متابعة حقيقية", interaction_type: "CALL" })], tags: [expect.objectContaining({ name: "مهم" })] });
    const audit = await getDataPlane().prepare("SELECT action FROM audit_logs WHERE tenant_id = ? ORDER BY created_at").all(identity.tenantId) as Array<{ action: string }>;
    expect(audit.map(row => row.action)).toEqual(expect.arrayContaining(["customer.create", "crm.interaction.create", "crm.tag.link"]));
  });

  it("rejects unauthorized, cross-tenant, invalid and duplicate-email operations", async () => {
    expect((await request("/api/platform/customers")).status).toBe(401);
    const identity = await register(`customers-isolation-${Date.now()}@example.com`, "Customers Isolation Tenant");
    const other = await register(`customers-other-${Date.now()}@example.com`, "Other Customers Tenant");
    const headers = auth(identity);
    const created = await request("/api/platform/customers", { method: "POST", headers, body: JSON.stringify({ name: "عميل عزل", email: "isolated@example.test" }) });
    const { customerId } = await created.json() as { customerId: string };
    expect((await request("/api/platform/customers", { method: "POST", headers, body: JSON.stringify({ name: "", email: "bad@example.test" }) })).status).toBe(400);
    expect((await request("/api/platform/customers", { method: "POST", headers, body: JSON.stringify({ name: "تكرار بريد", email: "isolated@example.test" }) })).status).toBe(409);
    expect((await request(`/api/platform/customers/${customerId}/history`, { headers: auth(other) })).status).toBe(404);
    expect((await request(`/api/platform/customers/${customerId}/interactions`, { method: "POST", headers: auth(other), body: JSON.stringify({ note: "اختراق" }) })).status).toBe(404);
  });
});
