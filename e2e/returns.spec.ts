import { expect, test } from "@playwright/test";

async function openRetailModule(page: import("@playwright/test").Page, module: RegExp) {
  await page.goto("/app?tab=work");
  await page.getByRole("button", { name: "التشغيل", exact: true }).click();
  await page.getByRole("button", { name: /التجارة والتجزئة/ }).click();
  await page.getByRole("button", { name: module }).click();
}

test("Sales Return from UI restores inventory and persists through Backend", async ({ page }) => {
  const registration = await page.request.post("/api/platform/auth/register", { data: { email: `e2e-sales-return-${Date.now()}@example.test`, password: "secure-password-123", displayName: "Sales Return E2E", tenantName: "Sales Return E2E Tenant" } });
  expect(registration.status()).toBe(201);
  const identity = await registration.json() as { token: string; tenantId: string; businessId: string; branchId: string };
  const headers = { authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId };
  const product = await page.request.post("/api/platform/products", { headers, data: { businessId: identity.businessId, sku: `RET-${Date.now()}`, name: "منتج Sales Return E2E", priceCents: 1500 } });
  const { productId } = await product.json() as { productId: string };
  const supplier = await page.request.post("/api/platform/suppliers", { headers, data: { businessId: identity.businessId, name: "مورد Returns E2E" } });
  const { supplierId } = await supplier.json() as { supplierId: string };
  expect((await page.request.post("/api/platform/purchases", { headers, data: { businessId: identity.businessId, branchId: identity.branchId, supplierId, items: [{ productId, quantity: 5, unitCostCents: 900 }], idempotencyKey: `return-purchase-${Date.now()}` } })).status()).toBe(201);
  const customer = await page.request.post("/api/platform/customers", { headers, data: { name: "عميل Sales Return E2E" } });
  const { customerId } = await customer.json() as { customerId: string };
  const order = await page.request.post("/api/platform/orders", { headers, data: { businessId: identity.businessId, branchId: identity.branchId, customerId, items: [{ productId, quantity: 1 }] } });
  expect(order.status()).toBe(201);

  await page.addInitScript(({ token, tenantId }) => { localStorage.setItem("platform_token", token); localStorage.setItem("platform_tenant_id", tenantId); }, identity);
  await openRetailModule(page, /المبيعات والطلبات/);
  const panel = page.getByLabel("إدارة مرتجعات المبيعات الحقيقية");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "فتح الطلب للمرتجع" }).click();
  await panel.getByLabel("كمية مرتجع منتج Sales Return E2E").fill("1");
  await panel.getByRole("button", { name: "تسجيل Sales Return" }).click();
  await expect(panel.getByText("تم تسجيل Sales Return وتحديث Inventory وLedger وAudit.")).toBeVisible();
  const inventory = await page.request.get("/api/platform/inventory", { headers });
  await expect(inventory.json()).resolves.toMatchObject({ stock: [expect.objectContaining({ product_id: productId, quantity: 5 })] });
});

test("Supplier Return from UI decreases inventory and rejects unreceived quantity", async ({ page }) => {
  const registration = await page.request.post("/api/platform/auth/register", { data: { email: `e2e-supplier-return-${Date.now()}@example.test`, password: "secure-password-123", displayName: "Supplier Return E2E", tenantName: "Supplier Return E2E Tenant" } });
  const identity = await registration.json() as { token: string; tenantId: string; businessId: string; branchId: string };
  const headers = { authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId };
  const product = await page.request.post("/api/platform/products", { headers, data: { businessId: identity.businessId, sku: `SRET-${Date.now()}`, name: "منتج Supplier Return E2E", priceCents: 1500 } });
  const { productId } = await product.json() as { productId: string };
  const supplier = await page.request.post("/api/platform/suppliers", { headers, data: { businessId: identity.businessId, name: "مورد Supplier Return E2E" } });
  const { supplierId } = await supplier.json() as { supplierId: string };
  const purchase = await page.request.post("/api/platform/purchases", { headers, data: { businessId: identity.businessId, branchId: identity.branchId, supplierId, items: [{ productId, quantity: 5, unitCostCents: 800 }], idempotencyKey: `supplier-return-purchase-${Date.now()}` } });
  const { purchaseId } = await purchase.json() as { purchaseId: string };

  await page.addInitScript(({ token, tenantId }) => { localStorage.setItem("platform_token", token); localStorage.setItem("platform_tenant_id", tenantId); }, identity);
  await openRetailModule(page, /الموردون تنظيم الموردين/);
  const panel = page.getByLabel("إدارة المشتريات والاستلام الحقيقية");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "فتح Purchase Order" }).click();
  await panel.getByLabel("كمية Supplier Return منتج Supplier Return E2E").fill("1");
  await panel.getByLabel("سبب Supplier Return").fill("اختبار مرتجع مورد حقيقي");
  await panel.getByRole("button", { name: "تسجيل Supplier Return" }).click();
  await expect(panel.getByText("تم تسجيل Supplier Return وتحديث Inventory وLedger وAudit.")).toBeVisible();
  const inventory = await page.request.get("/api/platform/inventory", { headers });
  await expect(inventory.json()).resolves.toMatchObject({ stock: [expect.objectContaining({ product_id: productId, quantity: 4 })] });
  const item = await page.request.get(`/api/platform/purchases/${purchaseId}`, { headers });
  await expect(item.json()).resolves.toMatchObject({ purchase: { supplier_id: supplierId } });
});
