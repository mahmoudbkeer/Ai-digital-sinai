import { expect, test } from "@playwright/test";

test("App Mode opens and navigates across mobile tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("AI DIGITAL", { exact: false })).toBeVisible();
  await expect(page.getByText("خارطة التنفيذ الاحترافية")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await expect(page.getByText(/التطبيق متصل بالخادم|تعذر الاتصال بالخادم/)).toBeVisible();
  await expect(page.getByText("حالة المنصة الآن")).toBeVisible();
  await expect(page.getByText(/تحتاج إعداداً|جاهزة/)).toBeVisible();

  await page.getByRole("button", { name: "السوق", exact: true }).click();
  await expect(page.getByRole("heading", { name: "اكتشف ما حولك." })).toBeVisible();
  await page.getByRole("button", { name: "تحميل السوق من الخادم" }).click();
  await expect(page.getByText(/سجّل الدخول لعرض السوق المعزول|تعذر تحميل بيانات السوق الحقيقية|لا توجد عروض منشورة/)).toBeVisible();

  await page.getByRole("button", { name: "التشغيل", exact: true }).click();
  await expect(page.getByRole("heading", { name: "مساحة التشغيل" })).toBeVisible();
  await expect(page.getByText("ابدأ مساحة عملك")).toBeVisible();
  await page.getByRole("button", { name: /التجارة والتجزئة/ }).click();
  await expect(page.getByRole("heading", { name: "التجارة والتجزئة" })).toBeVisible();
  await page.getByRole("button", { name: /الكتالوج والخدمات/ }).click();
  await expect(page.getByRole("heading", { name: "الكتالوج والخدمات" })).toBeVisible();
  await page.getByRole("button", { name: "فتح الأمر" }).first().click();
  await expect(page.getByText(/يتطلب هذا الأمر تسجيل الدخول|يلزم سياق مستخدم ومساحة عمل مصادق عليهما|تعذر الوصول إلى مركز الأوامر/)).toBeVisible();

  await page.getByRole("button", { name: "حسابي", exact: true }).click();
  await expect(page.getByRole("heading", { name: "حسابي" })).toBeVisible();
});
