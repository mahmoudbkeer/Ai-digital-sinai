import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { createPlatformRouter, platformErrorHandler } from "./platform";
import { resetDatabaseForTests } from "./database";
import { getDataPlane } from "./dataPlane";

let server: Server;
let baseUrl = "";

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}
async function register(email: string, tenantName: string) {
  const response = await request("/api/platform/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "secure-password-123",
      displayName: "مستخدم الأعمال",
      tenantName,
    }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{
    token: string;
    tenantId: string;
    businessId: string;
    branchId: string;
    userId: string;
  }>;
}
function auth(identity: { token: string; tenantId: string }) {
  return {
    authorization: `Bearer ${identity.token}`,
    "x-tenant-id": identity.tenantId,
  };
}

beforeAll(async () => {
  process.env.SQLITE_PATH = ":memory:";
  const app = express();
  app.use(express.json());
  app.use("/api/platform", createPlatformRouter());
  app.use(platformErrorHandler);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server failed");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(() => {
  server.close();
  resetDatabaseForTests();
});

describe("Business OS workflows", () => {
  it("runs procurement, inventory, finance, CRM, POS, marketplace, and reports with tenant scope", async () => {
    const identity = await register(
      "business-os@example.com",
      "Business OS Tenant"
    );
    const headers = auth(identity);
    const subscription = await request("/api/platform/subscriptions", {
      method: "POST",
      headers,
      body: JSON.stringify({ planCode: "trial" }),
    });
    expect(subscription.status).toBe(201);
    const product = await request("/api/platform/products", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: identity.businessId,
        sku: "BUS-001",
        name: "منتج الأعمال",
        priceCents: 2500,
      }),
    });
    expect(product.status).toBe(201);
    const { productId } = (await product.json()) as { productId: string };
    const supplier = await request("/api/platform/suppliers", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: identity.businessId,
        name: "مورد الاختبار",
      }),
    });
    expect(supplier.status).toBe(201);
    const { supplierId } = (await supplier.json()) as { supplierId: string };
    const purchase = await request("/api/platform/purchases", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: identity.businessId,
        branchId: identity.branchId,
        supplierId,
        idempotencyKey: "purchase-test-001",
        items: [{ productId, quantity: 5, unitCostCents: 1000 }],
      }),
    });
    expect(purchase.status).toBe(201);
    await expect(purchase.json()).resolves.toMatchObject({
      status: "RECEIVED",
      totalCents: 5000,
    });
    const replay = await request("/api/platform/purchases", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: identity.businessId,
        branchId: identity.branchId,
        supplierId,
        idempotencyKey: "purchase-test-001",
        items: [{ productId, quantity: 5, unitCostCents: 1000 }],
      }),
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ replay: true });
    const stock = await request("/api/platform/inventory", { headers });
    await expect(stock.json()).resolves.toMatchObject({
      stock: [expect.objectContaining({ product_id: productId, quantity: 5 })],
    });
    const customer = await request("/api/platform/customers", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "عميل الأعمال", phone: "01000000000" }),
    });
    expect(customer.status).toBe(201);
    const { customerId } = (await customer.json()) as { customerId: string };
    const interaction = await request(
      `/api/platform/customers/${customerId}/interactions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ note: "اتصال متابعة" }),
      }
    );
    expect(interaction.status).toBe(201);
    const tag = await request(`/api/platform/customers/${customerId}/tags`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "مهم" }),
    });
    expect(tag.status).toBe(201);
    const order = await request("/api/platform/orders", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: identity.businessId,
        branchId: identity.branchId,
        customerId,
        items: [{ productId, quantity: 1 }],
      }),
    });
    expect(order.status).toBe(201);
    const { orderId } = (await order.json()) as { orderId: string };
    const session = await request("/api/platform/pos/sessions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        branchId: identity.branchId,
        openingBalanceCents: 1000,
      }),
    });
    expect(session.status).toBe(201);
    const { sessionId } = (await session.json()) as { sessionId: string };
    const posSale = await request(
      `/api/platform/pos/sessions/${sessionId}/sales`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          orderId,
          amountCents: 2500,
          paymentMethod: "CASH",
        }),
      }
    );
    expect(posSale.status).toBe(201);
    await expect(posSale.json()).resolves.toMatchObject({ status: "PAID" });
    const close = await request(
      `/api/platform/pos/sessions/${sessionId}/close`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ closingBalanceCents: 3500 }),
      }
    );
    expect(close.status).toBe(200);
    const expense = await request("/api/platform/expenses", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: identity.businessId,
        branchId: identity.branchId,
        amountCents: 300,
        category: "تشغيل",
        description: "مصروف اختبار",
      }),
    });
    expect(expense.status).toBe(201);
    const review = await request("/api/platform/marketplace/reviews", {
      method: "POST",
      headers,
      body: JSON.stringify({ productId, customerId, rating: 5, body: "جيد" }),
    });
    expect(review.status).toBe(201);
    const favorite = await request("/api/platform/marketplace/favorites", {
      method: "POST",
      headers,
      body: JSON.stringify({ productId }),
    });
    expect(favorite.status).toBe(201);
    const report = await request("/api/platform/reports/summary", { headers });
    expect(report.status).toBe(200);
    await expect(report.json()).resolves.toMatchObject({
      source: "database",
      reports: {
        sales: expect.objectContaining({ orders: 1 }),
        expenses: expect.objectContaining({ total_cents: 300 }),
        profitCents: 0 - 300,
      },
    });
    const ledger = (await getDataPlane()
      .prepare(
        "SELECT COALESCE(SUM(debit_cents), 0) AS debit, COALESCE(SUM(credit_cents), 0) AS credit FROM ledger_entries WHERE tenant_id = ?"
      )
      .get(identity.tenantId)) as { debit: number; credit: number };
    expect(ledger.debit).toBe(ledger.credit);
    const history = await request(
      `/api/platform/customers/${customerId}/history`,
      { headers }
    );
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toMatchObject({
      orders: [expect.objectContaining({ id: orderId })],
      interactions: [expect.objectContaining({ note: "اتصال متابعة" })],
      tags: [expect.objectContaining({ name: "مهم" })],
    });
  });

  it("enforces subscription entitlements server-side", async () => {
    const identity = await register(
      "entitlements@example.com",
      "Entitlement Tenant"
    );
    const headers = auth(identity);
    const denied = await request("/api/platform/reports/summary", { headers });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: "feature-not-entitled",
    });
    const subscription = await request("/api/platform/subscriptions", {
      method: "POST",
      headers,
      body: JSON.stringify({ planCode: "trial" }),
    });
    expect(subscription.status).toBe(201);
    const allowed = await request("/api/platform/reports/summary", { headers });
    expect(allowed.status).toBe(200);
  });
});
