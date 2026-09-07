import { expect, test } from "@playwright/test";

test("Marketplace assistant searches the live directory and renders its result", async ({ page, request }) => {
  const registration = await request.post("/api/platform/auth/register", {
    data: {
      email: `marketplace-assistant-${Date.now()}@example.com`,
      password: "MarketplaceTestPassword123!",
      displayName: "اختبار مساعد Marketplace",
      tenantName: "صيدلية النور - اختبار Marketplace",
    },
  });
  expect(registration.status()).toBe(201);

  const directoryRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/platform/marketplace/directory")) directoryRequests.push(request.url());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "فتح خدمة المساعد الذكي" }).click();
  await page.getByLabel("طلب المساعد الذكي").fill("صيدلية");
  await page.getByRole("button", { name: "تنفيذ الطلب" }).click();

  await expect.poll(() => directoryRequests.some((url) => new URL(url).searchParams.get("query") === "صيدلية")).toBe(true);
  const result = page.locator(".assistant-result").first();
  await expect(result).toBeVisible();
  await expect(result).toContainText(/صيدلية|صيد/);
  await page.screenshot({ path: "artifacts/marketplace-assistant-search.png", fullPage: false });

  const businessId = await result.evaluate((node) => node.getAttribute("data-business-id"));
  expect(businessId).toBeTruthy();
  await result.click();
  await expect(page.locator(`#business-${businessId}`)).toBeInViewport();
});
