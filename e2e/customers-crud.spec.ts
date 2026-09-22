import { expect, test } from "@playwright/test";

test("Customers operational journey: create, list, history, interaction, tag and reload", async ({ page }) => {
  const email = `e2e-customers-${Date.now()}@example.test`;
  const registration = await page.request.post("/api/platform/auth/register", { data: { email, password: "secure-password-123", displayName: "Customers E2E", tenantName: "Customers E2E Tenant" } });
  expect(registration.status()).toBe(201);
  const identity = await registration.json() as { token: string; tenantId: string };
  const headers = { authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId };
  await page.addInitScript(({ token, tenantId }) => { localStorage.setItem("platform_token", token); localStorage.setItem("platform_tenant_id", tenantId); }, identity);
  await page.goto("/app?tab=work");
  await page.getByRole("button", { name: "التشغيل", exact: true }).click();
  await page.getByRole("button", { name: /التجارة والتجزئة/ }).click();
  await page.getByRole("button", { name: /العملاء إدارة ملفات العملاء/ }).click();
  await expect(page.getByLabel("إدارة العملاء الحقيقية")).toBeVisible();
  await expect(page.getByText("عدد العملاء: 0")).toBeVisible();

  await page.getByLabel("اسم العميل").fill("عميل Customers E2E");
  await page.getByLabel("هاتف العميل").fill("01099999999");
  await page.getByLabel("بريد العميل").fill("customers-e2e@example.test");
  await page.getByRole("button", { name: "إنشاء وحفظ" }).click();
  await expect(page.getByText("تم إنشاء العميل وتسجيل العملية في Audit.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "عميل Customers E2E" })).toBeVisible();

  const listResponse = await page.request.get("/api/platform/customers?query=Customers%20E2E", { headers });
  expect(listResponse.status()).toBe(200);
  const listPayload = await listResponse.json() as { customers: Array<{ id: string }> };
  expect(listPayload.customers).toHaveLength(1);
  const customerId = listPayload.customers[0].id;

  await page.getByRole("button", { name: "فتح ملف العميل" }).click();
  await expect(page.getByLabel("تفاصيل العميل")).toBeVisible();
  await expect(page.getByText("سجل الطلبات (0)")).toBeVisible();
  await page.getByLabel("ملاحظة التفاعل").fill("تم التواصل مع العميل من خلال رحلة E2E");
  await page.getByRole("button", { name: "حفظ التفاعل" }).click();
  await expect(page.getByText("تمت إضافة التفاعل وتسجيله في Audit.")).toBeVisible();
  await page.getByLabel("اسم الوسم").fill("عميل مهم");
  await page.getByRole("button", { name: "حفظ الوسم" }).click();
  await expect(page.getByText("تمت إضافة الوسم وتسجيل العملية في Audit.")).toBeVisible();
  await expect(page.getByText("عميل مهم")).toBeVisible();

  const historyResponse = await page.request.get(`/api/platform/customers/${customerId}/history`, { headers });
  expect(historyResponse.status()).toBe(200);
  await expect(historyResponse.json()).resolves.toMatchObject({ interactions: [expect.objectContaining({ note: "تم التواصل مع العميل من خلال رحلة E2E" })], tags: [expect.objectContaining({ name: "عميل مهم" })] });

  await page.reload();
  await page.getByRole("button", { name: "التشغيل", exact: true }).click();
  await page.getByRole("button", { name: /التجارة والتجزئة/ }).click();
  await page.getByRole("button", { name: /العملاء إدارة ملفات العملاء/ }).click();
  await expect(page.getByText("عميل Customers E2E")).toBeVisible();
});
