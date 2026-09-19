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
  const response = await request("/api/platform/auth/register", { method: "POST", body: JSON.stringify({ email, password: "secure-password-123", displayName: "Products Owner", tenantName }) });
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

describe("Products CRUD", () => {
  it("supports real list/search/detail/update/archive with tenant scope and audit", async () => {
    const identity = await register("products-crud@example.com", "Products Tenant");
    const headers = auth(identity);
    const created = await request("/api/platform/products", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, sku: "CRUD-001", name: "منتج أصلي", description: "وصف", category: "عام", priceCents: 1200 }) });
    expect(created.status).toBe(201);
    const { productId } = await created.json() as { productId: string };
    const list = await request("/api/platform/products?query=CRUD-001", { headers });
    await expect(list.json()).resolves.toMatchObject({ products: [expect.objectContaining({ id: productId, sku: "CRUD-001", status: "active" })] });
    const detail = await request(`/api/platform/products/${productId}`, { headers });
    await expect(detail.json()).resolves.toMatchObject({ product: expect.objectContaining({ name: "منتج أصلي" }) });
    const updated = await request(`/api/platform/products/${productId}`, { method: "PATCH", headers, body: JSON.stringify({ name: "منتج معدل", category: "مميز", priceCents: 1400 }) });
    expect(updated.status).toBe(200);
    const archived = await request(`/api/platform/products/${productId}/status`, { method: "PATCH", headers, body: JSON.stringify({ status: "archived" }) });
    expect(archived.status).toBe(200);
    expect((await (await request(`/api/platform/products/${productId}`, { headers })).status)).toBe(404);
    const archivedDetail = await request(`/api/platform/products/${productId}?includeArchived=true`, { headers });
    await expect(archivedDetail.json()).resolves.toMatchObject({ product: expect.objectContaining({ status: "archived", name: "منتج معدل" }) });
    const audit = await getDataPlane().prepare("SELECT action FROM audit_logs WHERE tenant_id = ? AND resource_type = 'product' AND resource_id = ? ORDER BY created_at").all(identity.tenantId, productId) as Array<{ action: string }>;
    expect(audit.map(row => row.action)).toEqual(expect.arrayContaining(["product.create", "product.update", "product.archive"]));
  });

  it("rejects unauthorized, cross-tenant access, SKU conflicts, and locked SKU updates", async () => {
    expect((await request("/api/platform/products")).status).toBe(401);
    const identity = await register("products-isolation@example.com", "Products Isolation Tenant");
    const other = await register("products-other@example.com", "Other Tenant");
    const headers = auth(identity);
    const created = await request("/api/platform/products", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, sku: "DUP-001", name: "منتج عزل", priceCents: 100 }) });
    const { productId } = await created.json() as { productId: string };
    expect((await request("/api/platform/products", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, sku: "DUP-001", name: "تكرار", priceCents: 100 }) })).status).toBe(409);
    expect((await request(`/api/platform/products/${productId}`, { headers: auth(other) })).status).toBe(404);
    await getDataPlane().prepare("INSERT INTO inventory_movements (id, tenant_id, branch_id, product_id, quantity_delta, reason, idempotency_key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("movement-products-lock", identity.tenantId, identity.branchId, productId, 1, "test", "products-lock-key", identity.userId, Date.now());
    const locked = await request(`/api/platform/products/${productId}`, { method: "PATCH", headers, body: JSON.stringify({ sku: "DUP-002" }) });
    expect(locked.status).toBe(409);
    await expect(locked.json()).resolves.toMatchObject({ error: "sku-locked" });
  });
});
