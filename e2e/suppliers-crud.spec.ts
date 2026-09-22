import { expect, test } from "@playwright/test";

test("Suppliers operational journey: create, search, detail, reload and audit context", async ({ page }) => {
  const email = `e2e-suppliers-${Date.now()}@example.test`;
  const registration = await page.request.post("/api/platform/auth/register", { data: { email, password: "secure-password-123", displayName: "Suppliers E2E", tenantName: "Suppliers E2E Tenant" } });
  expect(registration.status()).toBe(201);
  const identity = await registration.json() as { token: string; tenantId: string };
  const headers = { authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId };
  await page.addInitScript(({ token, tenantId }) => { localStorage.setItem("platform_token", token); localStorage.setItem("platform_tenant_id", tenantId); }, identity);
  await page.goto("/app?tab=work");
  await page.getByRole("button", { name: "التشغيل", exact: true }).click();
  await page.getByRole("button", { name: /التجارة والتجزئة/ }).click();
  await page.getByRole("button", { name: /الموردون تنظيم الموردين/ }).click();
  const suppliersPanel = page.getByLabel("إدارة الموردين الحقيقية");
  await expect(suppliersPanel.getByRole("heading", { name: "إدارة الموردين" })).toBeVisible();
  await expect(page.getByText("عدد الموردين: 0")).toBeVisible();

  await page.getByLabel("اسم المورد").fill("مورد Suppliers E2E");
  await page.getByLabel("هاتف المورد").fill("01088888888");
  await page.getByLabel("بريد المورد").fill("suppliers-e2e@example.test");
  await page.getByRole("button", { name: "إنشاء وحفظ" }).click();
  await expect(page.getByText("تم إنشاء المورد وتسجيل العملية في Audit.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "مورد Suppliers E2E" })).toBeVisible();
  await expect(suppliersPanel.getByText("سجل التدقيق (1)")).toBeVisible();

  const listResponse = await page.request.get("/api/platform/suppliers", { headers });
  expect(listResponse.status()).toBe(200);
  await expect(listResponse.json()).resolves.toMatchObject({ suppliers: [expect.objectContaining({ name: "مورد Suppliers E2E" })] });
  await page.getByLabel("بحث الموردين").fill("Suppliers E2E");
  await expect(page.getByText("عدد الموردين: 1")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "التشغيل", exact: true }).click();
  await page.getByRole("button", { name: /التجارة والتجزئة/ }).click();
  await page.getByRole("button", { name: /الموردون تنظيم الموردين/ }).click();
  await expect(page.getByText("مورد Suppliers E2E")).toBeVisible();
});
