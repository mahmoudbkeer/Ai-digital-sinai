import { expect, test } from "@playwright/test";

const viewports = [
  { name: "768x1024", width: 768, height: 1024 },
  { name: "800x1280", width: 800, height: 1280 },
  { name: "1024x1366", width: 1024, height: 1366 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768-landscape", width: 1024, height: 768 },
];

async function assertViewportIntegrity(page: import("@playwright/test").Page, label: string) {
  const result = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const html = document.documentElement;
    const body = document.body;
    const visible = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      // The login page intentionally places its ambient glow partially off-canvas;
      // it is decorative only and does not participate in layout or interaction.
      if (element.matches(".login-orbit")) return false;
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    const clipped = visible
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > viewport.width + 1;
      })
      .slice(0, 12)
      .map((element) => ({ tag: element.tagName, className: element.className, rect: element.getBoundingClientRect().toJSON() }));
    return {
      viewport,
      htmlScrollWidth: html.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      overflowX: window.getComputedStyle(html).overflowX,
      bodyOverflowX: window.getComputedStyle(body).overflowX,
      clipped,
    };
  });

  expect(result.htmlScrollWidth, `${label}: document horizontal overflow`).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.bodyScrollWidth, `${label}: body horizontal overflow`).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.clipped, `${label}: visible elements clipped by viewport`).toEqual([]);
}

async function assertInViewport(page: import("@playwright/test").Page, locator: import("@playwright/test").Locator, label: string) {
  await expect(locator, label).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  await expect(locator, label).toBeInViewport();
  const box = await locator.boundingBox();
  expect(box, `${label}: missing bounding box`).not.toBeNull();
  expect(box!.width, `${label}: zero width`).toBeGreaterThan(0);
  expect(box!.height, `${label}: zero height`).toBeGreaterThan(0);
}

for (const viewport of viewports) {
  test(`Marketplace remains usable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await assertViewportIntegrity(page, `${viewport.name} Marketplace`);

    await assertInViewport(page, page.getByRole("heading", { name: "استكشف خدماتك بذكاء" }), `${viewport.name} Marketplace heading`);
    await assertInViewport(page, page.getByLabel("البحث في Marketplace"), `${viewport.name} Marketplace search`);
    await assertInViewport(page, page.locator(".category-grid").first(), `${viewport.name} category grid`);
    await assertInViewport(page, page.locator("#marketplace-listings"), `${viewport.name} listings`);

    const assistantTrigger = page.getByRole("button", { name: "فتح خدمة المساعد الذكي" });
    await assertInViewport(page, assistantTrigger, `${viewport.name} assistant CTA`);
    await assistantTrigger.click();
    const dialog = page.getByRole("dialog");
    await assertInViewport(page, dialog, `${viewport.name} assistant dialog`);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox!.x + dialogBox!.width, `${viewport.name} assistant dialog right bound`).toBeLessThanOrEqual(viewport.width + 1);
    expect(dialogBox!.y + dialogBox!.height, `${viewport.name} assistant dialog bottom bound`).toBeLessThanOrEqual(viewport.height + 1);
    await assertViewportIntegrity(page, `${viewport.name} Marketplace with dialog`);
  });

  test(`Login form remains reachable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/login");
    await assertViewportIntegrity(page, `${viewport.name} Login`);
    await assertInViewport(page, page.getByLabel("البريد الإلكتروني"), `${viewport.name} email input`);
    await assertInViewport(page, page.getByLabel("كلمة المرور"), `${viewport.name} password input`);
    await assertInViewport(page, page.getByRole("button", { name: "الدخول إلى مساحة العمل" }), `${viewport.name} login CTA`);
  });

  test(`Mobile web shell navigation remains usable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/app");
    await page.waitForLoadState("networkidle");
    await assertViewportIntegrity(page, `${viewport.name} App home`);
    const nav = page.getByRole("navigation", { name: "التنقل الرئيسي" });
    await assertInViewport(page, nav, `${viewport.name} primary navigation`);
    for (const tab of ["الرئيسية", "السوق", "التشغيل", "حسابي"]) {
      await assertInViewport(page, nav.getByRole("button", { name: tab }), `${viewport.name} ${tab} tab`);
    }

    await nav.getByRole("button", { name: "السوق" }).click();
    await assertInViewport(page, page.getByRole("heading", { name: "اكتشف ما حولك." }), `${viewport.name} market screen`);
    await nav.getByRole("button", { name: "التشغيل" }).click();
    await assertInViewport(page, page.getByRole("heading", { name: "مساحة التشغيل" }), `${viewport.name} business OS screen`);
    await page.getByRole("button", { name: "ابدأ تسجيل النشاط" }).click();
    await assertInViewport(page, page.getByLabel("اسم النشاط"), `${viewport.name} onboarding form`);
    await assertInViewport(page, page.getByRole("button", { name: "إرسال للمراجعة" }), `${viewport.name} onboarding CTA`);
    await assertViewportIntegrity(page, `${viewport.name} onboarding form`);
    await nav.getByRole("button", { name: "حسابي" }).click();
    await assertInViewport(page, page.getByRole("heading", { name: "حسابي" }), `${viewport.name} account screen`);
    await assertViewportIntegrity(page, `${viewport.name} App navigated`);
  });
}

// The native Android and iOS clients are separate UI implementations; this spec intentionally covers only the Web client.
