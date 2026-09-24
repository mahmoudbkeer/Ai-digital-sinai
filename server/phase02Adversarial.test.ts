import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { createPlatformRouter, platformErrorHandler } from "./platform";
import { resetDatabaseForTests } from "./database";
import { getDataPlane } from "./dataPlane";

let server: Server;
let baseUrl = "";
async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
}
async function register(email: string, tenantName: string) {
  const response = await request("/api/platform/auth/register", { method: "POST", body: JSON.stringify({ email, password: "secure-password-123", displayName: tenantName, tenantName }) });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ token: string; tenantId: string; businessId: string; branchId: string; userId: string }>;
}
function auth(identity: { token: string; tenantId: string }) { return { authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId }; }
function json(init: Record<string, unknown>) { return JSON.stringify(init); }

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
afterAll(() => { server.close(); resetDatabaseForTests(); });

describe("Phase 02 adversarial security and financial integrity", () => {
  it("rejects cross-tenant detail, search, filter, and mutation attempts without side effects", async () => {
    const a = await register("phase02-a@example.test", "Phase 02 Tenant A");
    const b = await register("phase02-b@example.test", "Phase 02 Tenant B");
    const ha = auth(a); const hb = auth(b);
    const productResponse = await request("/api/platform/products", { method: "POST", headers: hb, body: json({ businessId: b.businessId, sku: "P2-B-001", name: "Tenant B Product", priceCents: 1200 }) });
    expect(productResponse.status).toBe(201);
    const { productId } = await productResponse.json() as { productId: string };
    const supplierResponse = await request("/api/platform/suppliers", { method: "POST", headers: hb, body: json({ businessId: b.businessId, name: "Tenant B Supplier" }) });
    expect(supplierResponse.status).toBe(201);
    const { supplierId } = await supplierResponse.json() as { supplierId: string };
    const customerResponse = await request("/api/platform/customers", { method: "POST", headers: hb, body: json({ name: "Tenant B Customer", email: "p2-b-customer@example.test" }) });
    expect(customerResponse.status).toBe(201);
    const { customerId } = await customerResponse.json() as { customerId: string };
    const purchaseResponse = await request("/api/platform/purchases", { method: "POST", headers: hb, body: json({ businessId: b.businessId, branchId: b.branchId, supplierId, idempotencyKey: "p2-b-purchase", items: [{ productId, quantity: 3, unitCostCents: 500 }] }) });
    expect(purchaseResponse.status).toBe(201);
    const { purchaseId } = await purchaseResponse.json() as { purchaseId: string };
    const orderResponse = await request("/api/platform/orders", { method: "POST", headers: hb, body: json({ businessId: b.businessId, branchId: b.branchId, customerId, items: [{ productId, quantity: 1 }] }) });
    expect(orderResponse.status).toBe(201);
    const { orderId } = await orderResponse.json() as { orderId: string };
    const invoiceResponse = await request("/api/platform/invoices", { method: "POST", headers: hb, body: json({ orderId }) });
    expect([200, 201]).toContain(invoiceResponse.status);
    const { invoiceId } = await invoiceResponse.json() as { invoiceId: string };
    const expenseResponse = await request("/api/platform/expenses", { method: "POST", headers: hb, body: json({ businessId: b.businessId, branchId: b.branchId, amountCents: 300, category: "security", description: "Tenant B expense", idempotencyKey: "p2-b-expense" }) });
    expect(expenseResponse.status).toBe(201);
    const { expenseId } = await expenseResponse.json() as { expenseId: string };

    const detailAttempts: Array<[string, string]> = [
      ["product", `/api/platform/products/${productId}`],
      ["supplier", `/api/platform/suppliers/${supplierId}/history`],
      ["purchase", `/api/platform/purchases/${purchaseId}`],
      ["order", `/api/platform/orders/${orderId}`],
      ["invoice", `/api/platform/invoices/${invoiceId}`],
      ["expense", `/api/platform/expenses/${expenseId}`],
      ["customer", `/api/platform/customers/${customerId}/history`],
    ];
    for (const [name, path] of detailAttempts) {
      const response = await request(path, { headers: ha });
      expect([403, 404], `${name} detail must be tenant scoped`).toContain(response.status);
      expect(await response.text()).not.toContain("Tenant B");
    }

    const filterAttempts = [
      `/api/platform/products?query=P2-B-001`,
      `/api/platform/customers?query=Tenant%20B`,
      `/api/platform/invoices?query=${invoiceId}`,
      `/api/platform/purchases?query=${purchaseId}`,
      `/api/platform/reports/profit?from=0&to=9999999999999`,
      `/api/platform/reports/summary?from=0&to=9999999999999`,
      `/api/platform/reconciliations?accountCode=4000`,
    ];
    for (const path of filterAttempts) {
      const response = await request(path, { headers: ha });
      expect([200, 403, 404]).toContain(response.status);
      expect(await response.text()).not.toContain("Tenant B");
    }

    const mutationAttempts: Array<[string, string, Record<string, unknown>]> = [
      [`/api/platform/products/${productId}`, "PATCH", { name: "cross-tenant mutation" }],
      [`/api/platform/products/${productId}/status`, "PATCH", { status: "archived" }],
      [`/api/platform/orders/${orderId}/state`, "PATCH", { state: "PROCESSING" }],
      [`/api/platform/expenses/${expenseId}/cancel`, "POST", {}],
      [`/api/platform/customers/${customerId}/interactions`, "POST", { note: "cross-tenant mutation" }],
      [`/api/platform/customers/${customerId}/tags`, "POST", { name: "cross-tenant tag" }],
      [`/api/platform/purchases/${purchaseId}/receipts`, "POST", { items: [], idempotencyKey: "p2-cross-receive" }],
      ["/api/platform/returns", "POST", { orderId, reason: "cross-tenant", idempotencyKey: "p2-cross-return", items: [{ productId, quantity: 1, unitRefundCents: 1200 }] }],
      ["/api/platform/supplier-returns", "POST", { purchaseId, reason: "cross-tenant", idempotencyKey: "p2-cross-supplier-return", items: [] }],
    ];
    for (const [path, method, body] of mutationAttempts) {
      const response = await request(path, { method, headers: ha, body: json(body) });
      expect([400, 403, 404, 409]).toContain(response.status);
    }

    const aProducts = await request("/api/platform/products", { headers: ha });
    const aCustomers = await request("/api/platform/customers", { headers: ha });
    const aLedger = await request("/api/platform/ledger/journals", { headers: ha });
    for (const response of [aProducts, aCustomers, aLedger]) expect(await response.text()).not.toContain("Tenant B");
  });

  it("enforces unauthenticated access and critical owner-only permissions server-side", async () => {
    const unauthenticated = await request("/api/platform/products");
    expect(unauthenticated.status).toBe(401);
    const owner = await register("phase02-owner@example.test", "Phase 02 RBAC");
    const employee = await register("phase02-employee@example.test", "Phase 02 Employee");
    const db = getDataPlane();
    await db.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, permissions_json, created_at) VALUES (?, ?, 'EMPLOYEE', '[]', ?)").run(owner.tenantId, employee.userId, Date.now());
    const employeeLogin = await request("/api/platform/auth/login", { method: "POST", body: json({ email: "phase02-employee@example.test", password: "secure-password-123" }) });
    expect(employeeLogin.status).toBe(200);
    const employeeIdentity = await employeeLogin.json() as { token: string };
    const he = auth({ token: employeeIdentity.token, tenantId: owner.tenantId });
    const deniedMutations = [
      ["/api/platform/products", { businessId: owner.businessId, sku: "P2-RBAC", name: "Denied", priceCents: 100 }],
      ["/api/platform/expenses", { businessId: owner.businessId, branchId: owner.branchId, amountCents: 100, category: "denied", description: "denied", idempotencyKey: "p2-rbac-expense" }],
      ["/api/platform/suppliers", { businessId: owner.businessId, name: "Denied Supplier" }],
      ["/api/platform/reconciliations", { accountCode: "4000", expectedCents: 0 }],
    ] as const;
    for (const [path, body] of deniedMutations) {
      const response = await request(path, { method: "POST", headers: he, body: json(body) });
      expect(response.status).toBe(403);
    }
    expect((await request("/api/platform/products", { headers: he })).status).toBe(200);
  });

  it("keeps financial mutations retry-safe under duplicate and parallel requests", async () => {
    const identity = await register("phase02-integrity@example.test", "Phase 02 Integrity");
    const headers = auth(identity);
    const productResponse = await request("/api/platform/products", { method: "POST", headers, body: json({ businessId: identity.businessId, sku: "P2-I-001", name: "Integrity Product", priceCents: 1000 }) });
    const { productId } = await productResponse.json() as { productId: string };
    const supplierResponse = await request("/api/platform/suppliers", { method: "POST", headers, body: json({ businessId: identity.businessId, name: "Integrity Supplier" }) });
    const { supplierId } = await supplierResponse.json() as { supplierId: string };
    const purchaseResponse = await request("/api/platform/purchases", { method: "POST", headers, body: json({ businessId: identity.businessId, branchId: identity.branchId, supplierId, idempotencyKey: "p2-integrity-purchase", items: [{ productId, quantity: 4, unitCostCents: 500 }] }) });
    const { purchaseId } = await purchaseResponse.json() as { purchaseId: string };
    const draftPurchaseResponse = await request("/api/platform/purchases", { method: "POST", headers, body: json({ businessId: identity.businessId, branchId: identity.branchId, supplierId, receiveImmediately: false, idempotencyKey: "p2-integrity-draft", items: [{ productId, quantity: 2, unitCostCents: 500 }] }) });
    const { purchaseId: draftPurchaseId } = await draftPurchaseResponse.json() as { purchaseId: string };
    const purchaseDetail = await request(`/api/platform/purchases/${draftPurchaseId}`, { headers });
    const purchasePayload = await purchaseDetail.json() as { items: Array<{ id: string; received_quantity: number }> };
    const purchaseItemId = purchasePayload.items[0].id;

    const movementBody = { branchId: identity.branchId, productId, quantityDelta: 1, reason: "p2-concurrent", idempotencyKey: "p2-concurrent-stock" };
    const movementResponses = await Promise.all([1, 2, 3].map(() => request("/api/platform/inventory/movements", { method: "POST", headers, body: json(movementBody) })));
    expect(movementResponses.map(response => response.status).sort()).toEqual([200, 200, 201]);
    const movementConflict = await request("/api/platform/inventory/movements", { method: "POST", headers, body: json({ ...movementBody, quantityDelta: 2 }) });
    expect(movementConflict.status).toBe(409);

    const expenseBody = { businessId: identity.businessId, branchId: identity.branchId, amountCents: 700, category: "p2", description: "parallel expense", idempotencyKey: "p2-concurrent-expense" };
    const expenseResponses = await Promise.all([request("/api/platform/expenses", { method: "POST", headers, body: json(expenseBody) }), request("/api/platform/expenses", { method: "POST", headers, body: json(expenseBody) })]);
    expect(expenseResponses.map(response => response.status).sort()).toEqual([200, 201]);
    const expenseConflict = await request("/api/platform/expenses", { method: "POST", headers, body: json({ ...expenseBody, amountCents: 701 }) });
    expect(expenseConflict.status).toBe(409);

    const receiptBody = { items: [{ purchaseItemId, quantity: 1 }], idempotencyKey: "p2-concurrent-receipt" };
    const receiptResponses = await Promise.all([request(`/api/platform/purchases/${draftPurchaseId}/receipts`, { method: "POST", headers, body: json(receiptBody) }), request(`/api/platform/purchases/${draftPurchaseId}/receipts`, { method: "POST", headers, body: json(receiptBody) })]);
    expect(receiptResponses.map(response => response.status).sort()).toEqual([200, 201]);

    const orderResponse = await request("/api/platform/orders", { method: "POST", headers, body: json({ businessId: identity.businessId, branchId: identity.branchId, items: [{ productId, quantity: 1 }] }) });
    const { orderId } = await orderResponse.json() as { orderId: string };
    const invoiceResponses = await Promise.all([request("/api/platform/invoices", { method: "POST", headers, body: json({ orderId }) }), request("/api/platform/invoices", { method: "POST", headers, body: json({ orderId }) })]);
    expect(invoiceResponses.map(response => response.status).sort()).toEqual([200, 200]);

    const orderDetail = await request(`/api/platform/orders/${orderId}`, { headers });
    const orderPayload = await orderDetail.json() as { order?: { id: string }; items?: Array<{ id: string; product_id: string }> };
    const orderItemId = orderPayload.items?.[0]?.id;
    expect(orderItemId).toBeTruthy();
    const returnBody = { orderId, reason: "parallel return", idempotencyKey: "p2-concurrent-return", items: [{ orderItemId, productId, quantity: 1, unitRefundCents: 1000 }] };
    const returnResponses = await Promise.all([request("/api/platform/returns", { method: "POST", headers, body: json(returnBody) }), request("/api/platform/returns", { method: "POST", headers, body: json(returnBody) })]);
    expect(returnResponses.map(response => response.status).sort()).toEqual([200, 201]);

    const supplierReturnBody = { purchaseId: draftPurchaseId, reason: "parallel supplier return", idempotencyKey: "p2-concurrent-supplier-return", items: [{ purchaseItemId, quantity: 1 }] };
    const supplierReturnResponses = await Promise.all([request("/api/platform/supplier-returns", { method: "POST", headers, body: json(supplierReturnBody) }), request("/api/platform/supplier-returns", { method: "POST", headers, body: json(supplierReturnBody) })]);
    expect(supplierReturnResponses.map(response => response.status).sort()).toEqual([200, 201]);

    const balance = await dbBalance(identity.tenantId);
    expect(balance.debit).toBe(balance.credit);
    expect(balance.unbalanced).toBe(0);
    const audit = await getDataPlane().prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE tenant_id = ? AND action IN ('inventory.movement.create','expense.create','purchase.partial_receive','invoice.issue','order.return','supplier.return')").get(identity.tenantId) as { count: number };
    expect(Number(audit.count)).toBeGreaterThanOrEqual(6);
  });
});

async function dbBalance(tenantId: string) {
  const db = getDataPlane();
  return await db.prepare("SELECT (SELECT COALESCE(SUM(debit_cents), 0) FROM ledger_entries WHERE tenant_id = ?) AS debit, (SELECT COALESCE(SUM(credit_cents), 0) FROM ledger_entries WHERE tenant_id = ?) AS credit, (SELECT COUNT(*) FROM (SELECT j.id FROM ledger_journals j LEFT JOIN ledger_entries e ON e.journal_id = j.id AND e.tenant_id = j.tenant_id WHERE j.tenant_id = ? GROUP BY j.id HAVING COALESCE(SUM(e.debit_cents), 0) != COALESCE(SUM(e.credit_cents), 0))) AS unbalanced").get(tenantId, tenantId, tenantId) as { debit: number; credit: number; unbalanced: number };
}
