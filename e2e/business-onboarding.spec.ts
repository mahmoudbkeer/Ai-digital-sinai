import { expect, test } from "@playwright/test";

test("submits a business from Marketplace work area and keeps it pending review", async ({ page, request }) => {
  const email = `business-onboarding-${Date.now()}@example.com`;
  const password = "BusinessOnboardingPassword123!";
  const registration = await request.post("/api/platform/auth/register", { data: { email, password, displayName: "اختبار تسجيل نشاط", tenantName: "مستأجر تسجيل نشاط" } });
  expect(registration.status()).toBe(201);

  await page.goto("/app?tab=work");
  await page.getByRole("button", { name: "ابدأ تسجيل النشاط" }).click();
  await page.getByLabel("اسم النشاط").fill("مخبز اختبار المراجعة");
  await page.getByLabel("التصنيف").fill("المطاعم والأغذية");
  await page.getByLabel("الحي").fill("المساعيد");
  await page.getByLabel("رقم التواصل").fill("201000000001");
  await page.getByRole("button", { name: "إرسال للمراجعة" }).click();
  await expect(page.getByText("سجّل الدخول أولًا لإرسال نشاطك بأمان.")).toBeVisible();

  await page.getByRole("button", { name: "دخول" }).click();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "دخول" }).last().click();
  await expect(page.getByRole("heading", { name: "مساحة التشغيل" })).toBeVisible();
  await page.getByRole("button", { name: "ابدأ تسجيل النشاط" }).click();
  await page.getByLabel("اسم النشاط").fill("مخبز اختبار المراجعة");
  await page.getByLabel("التصنيف").fill("المطاعم والأغذية");
  await page.getByLabel("الحي").fill("المساعيد");
  await page.getByLabel("رقم التواصل").fill("201000000001");
  await page.getByRole("button", { name: "إرسال للمراجعة" }).click();
  await expect(page.getByText(/تم استلام نشاطك وسيبقى بانتظار المراجعة/)).toBeVisible();

  const directory = await request.get("/api/platform/marketplace/directory?query=%D9%85%D8%AE%D8%A8%D8%B2%20%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1%20%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%AC%D8%B9%D8%A9");
  expect(directory.ok()).toBeTruthy();
  await expect(directory.json()).resolves.toMatchObject({ businesses: [] });
  await page.screenshot({ path: "artifacts/business-onboarding-pending.png", fullPage: false });
});
