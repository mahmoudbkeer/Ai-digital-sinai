import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { createPlatformRouter, platformErrorHandler } from "./platform";
import { resetDatabaseForTests } from "./database";
import { getDataPlane } from "./dataPlane";

let server: Server;
let baseUrl = "";
async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
}
async function register(email: string, tenantName: string) {
  const response = await request("/api/platform/auth/register", { method: "POST", body: JSON.stringify({ email, password: "secure-password-123", displayName: "Sales QA", tenantName }) });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ token: string; tenantId: string; businessId: string; branchId: string }>;
}
function auth(identity: { token: string; tenantId: string }) { return { authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId }; }

beforeAll(async () => {
  process.env.SQLITE_PATH = ":memory:";
  const app = express(); app.use(express.json()); app.use("/api/platform", createPlatformRouter()); app.use(platformErrorHandler);
  server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("server failed");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(() => { server.close(); resetDatabaseForTests(); });

describe("Sales / Orders operational chain", () => {
  it("lists, details, transitions and preserves tenant/inventory/finance links", async () => {
    const identity = await register(`sales-${Date.now()}@example.com`, "Sales Tenant");
    const headers = auth(identity);
    expect((await request("/api/platform/subscriptions", { method: "POST", headers, body: JSON.stringify({ planCode: "trial" }) })).status).toBe(201);
    const productResponse = await request("/api/platform/products", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, sku: "SALES-001", name: "منتج مبيعات", priceCents: 2500 }) });
    expect(productResponse.status).toBe(201);
    const { productId } = await productResponse.json() as { productId: string };
    const supplierResponse = await request("/api/platform/suppliers", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, name: "مورد المبيعات" }) });
    const { supplierId } = await supplierResponse.json() as { supplierId: string };
    expect((await request("/api/platform/purchases", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, branchId: identity.branchId, supplierId, idempotencyKey: `sales-purchase-${Date.now()}`, items: [{ productId, quantity: 3, unitCostCents: 1000 }] }) })).status).toBe(201);
    const customerResponse = await request("/api/platform/customers", { method: "POST", headers, body: JSON.stringify({ name: "عميل الطلب", phone: "01000000000" }) });
    const { customerId } = await customerResponse.json() as { customerId: string };
    const orderResponse = await request("/api/platform/orders", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, branchId: identity.branchId, customerId, items: [{ productId, quantity: 2 }] }) });
    expect(orderResponse.status).toBe(201);
    const { orderId } = await orderResponse.json() as { orderId: string };
    expect((await request(`/api/platform/orders?query=${encodeURIComponent("عميل الطلب")}`, { headers })).status).toBe(200);
    const detailResponse = await request(`/api/platform/orders/${orderId}`, { headers });
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json() as { order: { total_cents: number; customer_name: string; state: string }; items: Array<{ product_name: string; quantity: number; line_total_cents: number }>; inventoryMovements: unknown[]; invoice: { total_cents: number }; ledger: unknown[]; allowedTransitions: string[] };
    expect(detail).toMatchObject({ order: { total_cents: 5000, customer_name: "عميل الطلب", state: "PENDING" }, invoice: { total_cents: 5000 }, allowedTransitions: ["CONFIRMED", "CANCELLED"] });
    expect(detail.items).toEqual([expect.objectContaining({ product_name: "منتج مبيعات", quantity: 2, line_total_cents: 5000 })]);
    expect(detail.inventoryMovements).toHaveLength(1);
    expect(detail.ledger.length).toBeGreaterThan(0);
    const validTransition = await request(`/api/platform/orders/${orderId}/state`, { method: "PATCH", headers, body: JSON.stringify({ state: "CONFIRMED" }) });
    expect(validTransition.status).toBe(200);
    const invalidTransition = await request(`/api/platform/orders/${orderId}/state`, { method: "PATCH", headers, body: JSON.stringify({ state: "COMPLETED" }) });
    expect(invalidTransition.status).toBe(409);
    const stock = await getDataPlane().prepare("SELECT quantity FROM inventory_stock WHERE tenant_id = ? AND branch_id = ? AND product_id = ?").get(identity.tenantId, identity.branchId, productId) as { quantity: number };
    expect(stock.quantity).toBe(1);
  });

  it("rejects foreign customer and cross-tenant order access", async () => {
    const a = await register(`sales-a-${Date.now()}@example.com`, "Sales Tenant A");
    const b = await register(`sales-b-${Date.now()}@example.com`, "Sales Tenant B");
    const foreignCustomer = await request("/api/platform/customers", { method: "POST", headers: auth(b), body: JSON.stringify({ name: "عميل B" }) });
    const { customerId } = await foreignCustomer.json() as { customerId: string };
    const product = await request("/api/platform/products", { method: "POST", headers: auth(a), body: JSON.stringify({ businessId: a.businessId, sku: "A-001", name: "منتج A", priceCents: 100 }) });
    const { productId } = await product.json() as { productId: string };
    const supplier = await request("/api/platform/suppliers", { method: "POST", headers: auth(a), body: JSON.stringify({ businessId: a.businessId, name: "مورد A" }) });
    const { supplierId } = await supplier.json() as { supplierId: string };
    await request("/api/platform/purchases", { method: "POST", headers: auth(a), body: JSON.stringify({ businessId: a.businessId, branchId: a.branchId, supplierId, idempotencyKey: `cross-${Date.now()}`, items: [{ productId, quantity: 1, unitCostCents: 50 }] }) });
    const foreignOrder = await request("/api/platform/orders", { method: "POST", headers: auth(a), body: JSON.stringify({ businessId: a.businessId, branchId: a.branchId, customerId, items: [{ productId, quantity: 1 }] }) });
    expect(foreignOrder.status).toBe(404);
    const ownOrder = await request("/api/platform/orders", { method: "POST", headers: auth(a), body: JSON.stringify({ businessId: a.businessId, branchId: a.branchId, items: [{ productId, quantity: 1 }] }) });
    const { orderId } = await ownOrder.json() as { orderId: string };
    expect((await request(`/api/platform/orders/${orderId}`, { headers: auth(b) })).status).toBe(404);
    expect((await request(`/api/platform/orders/${orderId}/state`, { method: "PATCH", headers: auth(b), body: JSON.stringify({ state: "CONFIRMED" }) })).status).toBe(404);
  });
});
