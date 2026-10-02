import { expect, test } from "@playwright/test";
import { registerVerified } from "./auth";

test("web login authenticates through the API and stores the workspace session", async ({ page }) => {
  const email = `e2e-login-${Date.now()}@example.test`;
  const password = "secure-password-123";
  await registerVerified(page.request, { email, password, displayName: "E2E Login", tenantName: "E2E Login Tenant" });

  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill("wrong-password-123");
  await page.getByRole("button", { name: "الدخول إلى مساحة العمل" }).click();
  await expect(page.getByRole("status")).toContainText("بيانات تسجيل الدخول غير صحيحة");

  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "الدخول إلى مساحة العمل" }).click();
  await expect(page.getByRole("status")).toContainText("تم تسجيل الدخول بأمان");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("platform_token"))).toBeTruthy();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("platform_tenant_id"))).toBeTruthy();
});
