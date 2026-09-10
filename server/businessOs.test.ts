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

  it("supports ledger-linked returns, partial receiving, reconciliation, segments, and detailed reports", async () => {
    const identity = await register("business-depth@example.com", "Business Depth Tenant");
    const headers = auth(identity);
    await expect((await request("/api/platform/subscriptions", { method: "POST", headers, body: JSON.stringify({ planCode: "trial" }) })).status).toBe(201);
    const product = await request("/api/platform/products", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, sku: "DEPTH-001", name: "منتج العمق", priceCents: 2500 }) });
    const { productId } = (await product.json()) as { productId: string };
    const supplier = await request("/api/platform/suppliers", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, name: "مورد العمق" }) });
    const { supplierId } = (await supplier.json()) as { supplierId: string };
    const receivedPurchase = await request("/api/platform/purchases", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, branchId: identity.branchId, supplierId, idempotencyKey: "depth-purchase-1", items: [{ productId, quantity: 3, unitCostCents: 1000 }] }) });
    expect(receivedPurchase.status).toBe(201);
    const receivedPurchaseBody = (await receivedPurchase.json()) as { purchaseId: string };
    const supplierItem = (await getDataPlane().prepare("SELECT id FROM purchase_items WHERE purchase_id = ?").get(receivedPurchaseBody.purchaseId)) as { id: string };
    const supplierReturn = await request("/api/platform/supplier-returns", { method: "POST", headers, body: JSON.stringify({ purchaseId: receivedPurchaseBody.purchaseId, reason: "اختبار مرتجع المورد", idempotencyKey: "depth-supplier-return-1", items: [{ purchaseItemId: supplierItem.id, quantity: 1 }] }) });
    expect(supplierReturn.status).toBe(201);
    const draftPurchase = await request("/api/platform/purchases", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, branchId: identity.branchId, supplierId, receiveImmediately: false, idempotencyKey: "depth-purchase-draft", items: [{ productId, quantity: 2, unitCostCents: 1000 }] }) });
    const { purchaseId: draftPurchaseId } = (await draftPurchase.json()) as { purchaseId: string };
    const draftItem = (await getDataPlane().prepare("SELECT id FROM purchase_items WHERE purchase_id = ?").get(draftPurchaseId)) as { id: string };
    const receipt = await request(`/api/platform/purchases/${draftPurchaseId}/receipts`, { method: "POST", headers, body: JSON.stringify({ items: [{ purchaseItemId: draftItem.id, quantity: 1 }] }) });
    expect(receipt.status).toBe(201);
    await expect(receipt.json()).resolves.toMatchObject({ receiptStatus: "PARTIALLY_RECEIVED", receivedQuantity: 1 });
    const customer = await request("/api/platform/customers", { method: "POST", headers, body: JSON.stringify({ name: "عميل العمق" }) });
    const { customerId } = (await customer.json()) as { customerId: string };
    const order = await request("/api/platform/orders", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, branchId: identity.branchId, customerId, items: [{ productId, quantity: 1 }] }) });
    const { orderId } = (await order.json()) as { orderId: string };
    const orderItem = (await getDataPlane().prepare("SELECT id FROM order_items WHERE order_id = ?").get(orderId)) as { id: string };
    const salesReturn = await request("/api/platform/returns", { method: "POST", headers, body: JSON.stringify({ orderId, reason: "اختبار مرتجع العميل", idempotencyKey: "depth-sales-return-1", items: [{ orderItemId: orderItem.id, productId, quantity: 1, unitRefundCents: 2500 }] }) });
    expect(salesReturn.status).toBe(201);
    await expect(salesReturn.json()).resolves.toMatchObject({ status: "POSTED", totalCents: 2500 });
    const reconciliation = await request("/api/platform/reconciliations", { method: "POST", headers, body: JSON.stringify({ accountCode: "4000", expectedCents: 0 }) });
    expect(reconciliation.status).toBe(201);
    const segment = await request("/api/platform/customer-segments", { method: "POST", headers, body: JSON.stringify({ name: "كل عملاء الاختبار", minOrders: 0, minSpendCents: 0 }) });
    expect(segment.status).toBe(201);
    const { segmentId } = (await segment.json()) as { segmentId: string };
    const segmentView = await request(`/api/platform/customer-segments/${segmentId}`, { headers });
    expect(segmentView.status).toBe(200);
    await expect(segmentView.json()).resolves.toMatchObject({ members: expect.arrayContaining([expect.objectContaining({ id: customerId })]) });
    for (const path of ["/api/platform/reports/profit", "/api/platform/reports/inventory", "/api/platform/reports/customers"]) expect((await request(path, { headers })).status).toBe(200);
  });

  it("exposes real-data cohorts, retention, CAC, and LTV analytics with tenant isolation", async () => {
    const identity = await register("analytics-depth@example.com", "Analytics Depth Tenant");
    const headers = auth(identity);
    await expect((await request("/api/platform/subscriptions", { method: "POST", headers, body: JSON.stringify({ planCode: "trial" }) })).status).toBe(201);
    const product = await request("/api/platform/products", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, sku: "ANALYTICS-001", name: "منتج التحليلات", priceCents: 1800 }) });
    const { productId } = (await product.json()) as { productId: string };
    const supplier = await request("/api/platform/suppliers", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, name: "مورد التحليلات" }) });
    const { supplierId } = (await supplier.json()) as { supplierId: string };
    await request("/api/platform/purchases", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, branchId: identity.branchId, supplierId, idempotencyKey: "analytics-purchase-1", items: [{ productId, quantity: 4, unitCostCents: 700 }] }) });
    const customer = await request("/api/platform/customers", { method: "POST", headers, body: JSON.stringify({ name: "عميل التحليلات" }) });
    const { customerId } = (await customer.json()) as { customerId: string };
    const order = await request("/api/platform/orders", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, branchId: identity.branchId, customerId, items: [{ productId, quantity: 1 }] }) });
    const { orderId } = (await order.json()) as { orderId: string };
    await getDataPlane().prepare("UPDATE orders SET state = 'COMPLETED' WHERE id = ? AND tenant_id = ?").run(orderId, identity.tenantId);
    for (const path of ["/api/platform/analytics/cohorts", "/api/platform/analytics/retention", "/api/platform/analytics/cac", "/api/platform/analytics/ltv"]) {
      const response = await request(path, { headers });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ ok: true, source: "database" });
    }
    const ltv = await request("/api/platform/analytics/ltv", { headers });
    await expect(ltv.json()).resolves.toMatchObject({ summary: expect.objectContaining({ customers: 1, completed_orders: 1, revenue_cents: 1800 }) });
    const other = await register("analytics-other@example.com", "Analytics Other Tenant");
    await expect((await request("/api/platform/subscriptions", { method: "POST", headers: auth(other), body: JSON.stringify({ planCode: "trial" }) })).status).toBe(201);
    const otherAnalytics = await request("/api/platform/analytics/ltv", { headers: auth(other) });
    await expect(otherAnalytics.json()).resolves.toMatchObject({ summary: expect.objectContaining({ customers: 0, completed_orders: 0, revenue_cents: 0 }) });
  });

  it("supports tenant-scoped delivery zones, distance pricing, and recorded GPS tracking", async () => {
    const identity = await register("logistics-depth@example.com", "Logistics Depth Tenant");
    const headers = auth(identity);
    const zone = await request("/api/platform/delivery-zones", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, branchId: identity.branchId, name: "وسط المدينة", centerLatitude: 30, centerLongitude: 33, radiusMeters: 10000, baseFeeCents: 100, perKmCents: 100 }) });
    expect(zone.status).toBe(201);
    const { zoneId } = (await zone.json()) as { zoneId: string };
    const quote = await request("/api/platform/delivery-quotes", { method: "POST", headers, body: JSON.stringify({ branchId: identity.branchId, latitude: 30.01, longitude: 33, zoneId }) });
    expect(quote.status).toBe(200);
    await expect(quote.json()).resolves.toMatchObject({ source: "database", zone: { id: zoneId }, pricing: "base_fee_cents + ceil(distance_km) * per_km_cents" });
    const product = await request("/api/platform/products", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, sku: "LOGISTICS-001", name: "منتج التوصيل", priceCents: 900 }) });
    const { productId } = (await product.json()) as { productId: string };
    const supplier = await request("/api/platform/suppliers", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, name: "مورد التوصيل" }) });
    const { supplierId } = (await supplier.json()) as { supplierId: string };
    await request("/api/platform/purchases", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, branchId: identity.branchId, supplierId, idempotencyKey: "logistics-purchase-1", items: [{ productId, quantity: 2, unitCostCents: 400 }] }) });
    const order = await request("/api/platform/orders", { method: "POST", headers, body: JSON.stringify({ businessId: identity.businessId, branchId: identity.branchId, items: [{ productId, quantity: 1 }] }) });
    const { orderId } = (await order.json()) as { orderId: string };
    const delivery = await request("/api/platform/deliveries", { method: "POST", headers, body: JSON.stringify({ orderId }) });
    expect(delivery.status).toBe(201);
    const { deliveryId } = (await delivery.json()) as { deliveryId: string };
    const location = await request(`/api/platform/deliveries/${deliveryId}/location`, { method: "POST", headers, body: JSON.stringify({ latitude: 30.01, longitude: 33.01, accuracyMeters: 8, recordedAt: 1700000000000 }) });
    expect(location.status).toBe(201);
    const locations = await request(`/api/platform/deliveries/${deliveryId}/locations`, { headers });
    await expect(locations.json()).resolves.toMatchObject({ deliveryId, locations: [expect.objectContaining({ latitude: 30.01, longitude: 33.01, accuracy_meters: 8, recorded_at: 1700000000000 })] });
    const other = await register("logistics-other@example.com", "Logistics Other Tenant");
    const crossTenant = await request(`/api/platform/deliveries/${deliveryId}/locations`, { headers: auth(other) });
    expect(crossTenant.status).toBe(404);
  });
});
