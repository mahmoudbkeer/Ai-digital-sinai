import { expect, test } from "@playwright/test";

test("Procurement and receiving operational journey: partial then final receipt", async ({ page }) => {
  const registration = await page.request.post("/api/platform/auth/register", { data: { email: `e2e-procurement-${Date.now()}@example.test`, password: "secure-password-123", displayName: "Procurement E2E", tenantName: "Procurement E2E Tenant" } });
  expect(registration.status()).toBe(201);
  const identity = await registration.json() as { token: string; tenantId: string; businessId: string; branchId: string };
  const headers = { authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId };
  const supplierResponse = await page.request.post("/api/platform/suppliers", { headers, data: { businessId: identity.businessId, name: "مورد Procurement E2E" } });
  expect(supplierResponse.status()).toBe(201);
  const productResponse = await page.request.post("/api/platform/products", { headers, data: { businessId: identity.businessId, sku: `PROC-${Date.now()}`, name: "منتج Procurement E2E", priceCents: 1000 } });
  expect(productResponse.status()).toBe(201);

  await page.addInitScript(({ token, tenantId }) => { localStorage.setItem("platform_token", token); localStorage.setItem("platform_tenant_id", tenantId); }, identity);
  await page.goto("/app?tab=work");
  await page.getByRole("button", { name: "التشغيل", exact: true }).click();
  await page.getByRole("button", { name: /التجارة والتجزئة/ }).click();
  await page.getByRole("button", { name: /الموردون تنظيم الموردين/ }).click();
  const panel = page.getByLabel("إدارة المشتريات والاستلام الحقيقية");
  await expect(panel).toBeVisible();
  await panel.getByLabel("مورد Purchase Order").selectOption({ label: "مورد Procurement E2E" });
  const productOption = panel.locator('select[aria-label="منتج Purchase Order"] option').filter({ hasText: "منتج Procurement E2E" }).first();
  await panel.getByLabel("منتج Purchase Order").selectOption({ label: (await productOption.textContent())?.trim() });
  await panel.getByLabel("كمية Purchase Order").fill("10");
  await panel.getByLabel("سعر Purchase Order").fill("700");
  await panel.getByRole("button", { name: "إنشاء Purchase Order" }).click();
  await expect(panel.getByText(/تم إنشاء Purchase Order/)).toBeVisible();
  await expect(panel.getByText("المطلوب: 10 · المستلم: 0 · المتبقي: 10")).toBeVisible();

  await panel.getByLabel("استلام منتج Procurement E2E").fill("4");
  await panel.getByRole("button", { name: "تسجيل الاستلام" }).click();
  await expect(panel.getByText("تم الاستلام عبر Backend وتحديث Inventory وAudit.")).toBeVisible();
  await expect(panel.getByText("المطلوب: 10 · المستلم: 4 · المتبقي: 6")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "التشغيل", exact: true }).click();
  await page.getByRole("button", { name: /التجارة والتجزئة/ }).click();
  const purchasesReload = page.waitForResponse((response) => response.url().includes("/api/platform/purchases") && response.request().method() === "GET");
  await page.getByRole("button", { name: /الموردون تنظيم الموردين/ }).click();
  await purchasesReload;
  const reloadedPanel = page.getByLabel("إدارة المشتريات والاستلام الحقيقية");
  await reloadedPanel.getByRole("button", { name: "فتح Purchase Order" }).click();
  await expect(reloadedPanel.getByText("المطلوب: 10 · المستلم: 4 · المتبقي: 6")).toBeVisible();
  await reloadedPanel.getByLabel("استلام منتج Procurement E2E").fill("6");
  await reloadedPanel.getByRole("button", { name: "تسجيل الاستلام" }).click();
  await expect(reloadedPanel.getByText("المطلوب: 10 · المستلم: 10 · المتبقي: 0")).toBeVisible();
  await expect(reloadedPanel.getByText("purchase.partial_receive")).toHaveCount(2);

  const inventory = await page.request.get("/api/platform/inventory", { headers });
  expect(inventory.status()).toBe(200);
  await expect(inventory.json()).resolves.toMatchObject({ stock: [expect.objectContaining({ name: "منتج Procurement E2E", quantity: 10 })] });
});
