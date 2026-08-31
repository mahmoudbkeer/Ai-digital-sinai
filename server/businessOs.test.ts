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

  it("enforces advertising creative approval and campaign state transitions", async () => {
    const identity = await register(
      "marketing@example.com",
      "Marketing Tenant"
    );
    const headers = auth(identity);
    const advertiser = await request("/api/platform/ads/advertisers", {
      method: "POST",
      headers,
      body: JSON.stringify({ businessId: identity.businessId }),
    });
    expect(advertiser.status).toBe(201);
    const { advertiserId } = (await advertiser.json()) as {
      advertiserId: string;
    };
    const campaign = await request("/api/platform/ads/campaigns", {
      method: "POST",
      headers,
      body: JSON.stringify({
        advertiserId,
        name: "حملة سيناء",
        budgetCents: 10000,
      }),
    });
    expect(campaign.status).toBe(201);
    const { campaignId } = (await campaign.json()) as { campaignId: string };
    const blockedApproval = await request(
      `/api/platform/marketing/campaigns/${campaignId}/actions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "APPROVE" }),
      }
    );
    expect(blockedApproval.status).toBe(409);
    const creative = await request(
      `/api/platform/ads/campaigns/${campaignId}/creatives`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ headline: "عرض محلي", body: "عرض موثق" }),
      }
    );
    expect(creative.status).toBe(201);
    const { creativeId } = (await creative.json()) as { creativeId: string };
    const approval = await request(
      `/api/platform/ads/creatives/${creativeId}/approve`,
      {
        method: "POST",
        headers,
      }
    );
    expect(approval.status).toBe(200);
    const transitions = [
      ["SUBMIT", "PENDING_REVIEW"],
      ["APPROVE", "ACTIVE"],
      ["PAUSE", "PAUSED"],
      ["RESUME", "ACTIVE"],
      ["END", "ENDED"],
    ] as const;
    for (const [action, status] of transitions) {
      const response = await request(
        `/api/platform/marketing/campaigns/${campaignId}/actions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ action }),
        }
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ action, status });
    }
  });

  it("exposes configurable tax readiness and grounded analytics fallbacks", async () => {
    const identity = await register(
      "productization@example.com",
      "Productization Tenant"
    );
    const headers = auth(identity);
    const initial = await request("/api/platform/configuration", { headers });
    expect(initial.status).toBe(200);
    await expect(initial.json()).resolves.toMatchObject({
      configuration: {
        currency: "EGP",
        tax_mode: "REQUIRES_CONFIGURATION",
        tax_rate_basis_points: 0,
      },
    });
    const update = await request("/api/platform/configuration", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        currency: "EGP",
        taxMode: "EXCLUSIVE",
        taxRateBasisPoints: 1400,
        invoicePrefix: "SIN",
        businessName: "نشاط سيناء",
      }),
    });
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({
      configuration: {
        tax_mode: "EXCLUSIVE",
        tax_rate_basis_points: 1400,
        invoice_prefix: "SIN",
      },
    });
    const product = await request("/api/platform/products", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: identity.businessId,
        sku: "TAX-001",
        name: "منتج الضريبة",
        priceCents: 1000,
      }),
    });
    expect(product.status).toBe(201);
    const { productId } = (await product.json()) as { productId: string };
    const supplier = await request("/api/platform/suppliers", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: identity.businessId,
        name: "مورد الضريبة",
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
        idempotencyKey: "tax-purchase-001",
        items: [{ productId, quantity: 2, unitCostCents: 500 }],
      }),
    });
    expect(purchase.status).toBe(201);
    const order = await request("/api/platform/orders", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: identity.businessId,
        branchId: identity.branchId,
        items: [{ productId, quantity: 1 }],
      }),
    });
    expect(order.status).toBe(201);
    await expect(order.json()).resolves.toMatchObject({
      totalCents: 1140,
      currency: "EGP",
    });
    const invoice = (await getDataPlane()
      .prepare(
        "SELECT invoice_number, tax_cents, total_cents, currency FROM invoices WHERE tenant_id = ? ORDER BY issued_at DESC LIMIT 1"
      )
      .get(identity.tenantId)) as {
      invoice_number: string;
      tax_cents: number;
      total_cents: number;
      currency: string;
    };
    expect(invoice).toMatchObject({
      tax_cents: 140,
      total_cents: 1140,
      currency: "EGP",
    });
    expect(invoice.invoice_number).toMatch(/^SIN-/);
    const subscription = await request("/api/platform/subscriptions", {
      method: "POST",
      headers,
      body: JSON.stringify({ planCode: "trial" }),
    });
    expect(subscription.status).toBe(201);
    const insights = await request("/api/platform/ai/advisor/insights", {
      headers,
    });
    expect(insights.status).toBe(200);
    await expect(insights.json()).resolves.toMatchObject({
      provider: "DETERMINISTIC_GROUNDED",
      source: "database",
      insights: expect.arrayContaining([
        expect.objectContaining({
          insightType: "SALES",
          evidence: expect.any(Object),
        }),
      ]),
    });
    const recommendations = await request("/api/platform/recommendations", {
      headers,
    });
    expect(recommendations.status).toBe(200);
    await expect(recommendations.json()).resolves.toMatchObject({
      method: "DETERMINISTIC_FALLBACK",
      source: "database",
    });
    const aiRequest = await request("/api/platform/ai/requests", {
      method: "POST",
      headers,
      body: JSON.stringify({
        purpose: "اختبار تحليل المبيعات",
        input: "حلل مبيعات هذا النشاط",
        allowedDataScope: ["orders"],
      }),
    });
    expect(aiRequest.status).toBe(201);
    const { requestId } = (await aiRequest.json()) as { requestId: string };
    const aiExecution = await request(
      `/api/platform/ai/requests/${requestId}/execute`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: "حلل مبيعات هذا النشاط" }),
      }
    );
    expect(aiExecution.status).toBe(503);
    await expect(aiExecution.json()).resolves.toMatchObject({
      status: "REQUIRES_SETUP",
    });
    const forecast = await request(
      "/api/platform/ai/advisor/forecast?metric=SALES&horizonDays=7",
      { headers }
    );
    expect(forecast.status).toBe(200);
    await expect(forecast.json()).resolves.toMatchObject({
      model: "INSUFFICIENT_DATA",
      confidence: 0,
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
