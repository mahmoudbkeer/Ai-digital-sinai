import { expect, test } from "@playwright/test";

test("Inventory UI reads real stock and records a movement through the API", async ({ page }) => {
  const email = `e2e-inventory-${Date.now()}@example.test`;
  const password = "secure-password-123";
  const registration = await page.request.post("/api/platform/auth/register", {
    data: { email, password, displayName: "Inventory E2E", tenantName: "Inventory E2E Tenant" },
  });
  expect(registration.status()).toBe(201);
  const identity = await registration.json() as { token: string; tenantId: string; businessId: string; branchId: string };
  const headers = { authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId };
  const productResponse = await page.request.post("/api/platform/products", {
    headers,
    data: { businessId: identity.businessId, sku: "E2E-INVENTORY-001", name: "منتج مخزون E2E", priceCents: 2500 },
  });
  expect(productResponse.status()).toBe(201);
  const { productId } = await productResponse.json() as { productId: string };

  await page.addInitScript(({ token, tenantId }) => {
    localStorage.setItem("platform_token", token);
    localStorage.setItem("platform_tenant_id", tenantId);
  }, identity);
  await page.goto("/app?tab=work");
  await page.getByRole("button", { name: /التجارة والتجزئة/ }).click();
  await page.getByRole("button", { name: /المخزون متابعة الكميات/ }).click();

  const inventoryPanel = page.getByLabel("إدارة المخزون الحقيقية");
  await expect(inventoryPanel.getByRole("heading", { name: "إدارة المخزون" })).toBeVisible();
  await expect(inventoryPanel.getByText("لا توجد سجلات مخزون حقيقية")).toBeVisible();
  await inventoryPanel.getByLabel("معرّف المنتج").fill(productId);
  await inventoryPanel.getByLabel("التغيير في الكمية").fill("5");
  await inventoryPanel.getByLabel("سبب الحركة").fill("استلام E2E");
  await inventoryPanel.getByRole("button", { name: "تسجيل الحركة" }).click();

  await expect(inventoryPanel.getByRole("status")).toContainText("الرصيد الجديد: 5");
  await expect(inventoryPanel.getByText("منتج مخزون E2E")).toBeVisible();
  await expect(inventoryPanel.getByText(/الكمية: 5/)).toBeVisible();
  await expect(inventoryPanel.getByText("E2E-INVENTORY-001")).toBeVisible();
});
