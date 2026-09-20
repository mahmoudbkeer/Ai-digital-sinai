import { expect, test } from "@playwright/test";

test("Business OS core modules load tenant data through their domain APIs", async ({ page }) => {
  const email = `e2e-business-os-${Date.now()}@example.test`;
  const password = "secure-password-123";
  const registration = await page.request.post("/api/platform/auth/register", {
    data: { email, password, displayName: "Business OS Connectivity", tenantName: "Business OS Connectivity Tenant" },
  });
  expect(registration.status()).toBe(201);
  const identity = await registration.json() as { token: string; tenantId: string; businessId: string; branchId: string };
  const headers = { authorization: `Bearer ${identity.token}`, "x-tenant-id": identity.tenantId };

  const productResponse = await page.request.post("/api/platform/products", {
    headers,
    data: { businessId: identity.businessId, sku: "CONNECTIVITY-001", name: "منتج اتصال حقيقي", priceCents: 1500 },
  });
  expect(productResponse.status()).toBe(201);
  const { productId } = await productResponse.json() as { productId: string };
  const movementResponse = await page.request.post("/api/platform/inventory/movements", {
    headers,
    data: { branchId: identity.branchId, productId, quantityDelta: 5, reason: "تهيئة اختبار الاتصال", idempotencyKey: `connectivity-${Date.now()}` },
  });
  expect(movementResponse.status()).toBe(201);
  const customerResponse = await page.request.post("/api/platform/customers", { headers, data: { name: "عميل اتصال حقيقي", email: "customer@example.test" } });
  expect(customerResponse.status()).toBe(201);
  const { customerId } = await customerResponse.json() as { customerId: string };
  const supplierResponse = await page.request.post("/api/platform/suppliers", { headers, data: { businessId: identity.businessId, name: "مورد اتصال حقيقي" } });
  expect(supplierResponse.status()).toBe(201);
  const { supplierId } = await supplierResponse.json() as { supplierId: string };
  const orderResponse = await page.request.post("/api/platform/orders", {
    headers,
    data: { businessId: identity.businessId, branchId: identity.branchId, customerId, items: [{ productId, quantity: 1 }] },
  });
  expect(orderResponse.status()).toBe(201);
  const { orderId } = await orderResponse.json() as { orderId: string };
  const purchaseResponse = await page.request.post("/api/platform/purchases", {
    headers,
    data: { businessId: identity.businessId, branchId: identity.branchId, supplierId, items: [{ productId, quantity: 1, unitCostCents: 700 }], idempotencyKey: `connectivity-purchase-${Date.now()}` },
  });
  expect(purchaseResponse.status()).toBe(201);

  await page.addInitScript(({ token, tenantId }) => {
    localStorage.setItem("platform_token", token);
    localStorage.setItem("platform_tenant_id", tenantId);
  }, { token: identity.token, tenantId: identity.tenantId });
  await page.goto("/app?tab=work");
  await page.getByRole("button", { name: "التشغيل", exact: true }).click();
  await page.getByRole("button", { name: /التجارة والتجزئة/ }).click();

  const modules = [
    { button: /المنتجات إدارة المنتجات/, endpoint: "/api/platform/products", text: "منتج اتصال حقيقي", panel: undefined },
    { button: /المخزون متابعة الكميات/, endpoint: "/api/platform/inventory", text: "CONNECTIVITY-001", panel: "إدارة المخزون الحقيقية" },
    { button: /المبيعات والطلبات/, endpoint: "/api/platform/orders", text: "عميل اتصال حقيقي", panel: "إدارة المبيعات والطلبات الحقيقية" },
    { button: /العملاء إدارة ملفات/, endpoint: "/api/platform/customers", text: "عميل اتصال حقيقي", panel: undefined },
    { button: /الموردون تنظيم الموردين/, endpoint: "/api/platform/suppliers", text: "مورد اتصال حقيقي", panel: undefined },
  ];
  for (const module of modules) {
    const responsePromise = page.waitForResponse((response) => response.url().includes(module.endpoint) && response.request().method() === "GET");
    await page.getByRole("button", { name: module.button }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    if (module.panel) await expect(page.getByLabel(module.panel)).toBeVisible();
    else await expect(page.getByText("البيانات الحقيقية")).toBeVisible();
    await expect(page.getByText(module.text, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: /العودة إلى وحدات/ }).click();
  }
  const salesResponsePromise = page.waitForResponse((response) => response.url().includes("/api/platform/orders") && response.request().method() === "GET");
  await page.getByRole("button", { name: /المبيعات والطلبات/ }).click();
  await salesResponsePromise;
  await expect(page.getByLabel("إدارة المبيعات والطلبات الحقيقية")).toBeVisible();
  await expect(page.getByText(orderId, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "فتح التفاصيل" }).click();
  const orderDetail = page.getByLabel("تفاصيل الطلب");
  await expect(orderDetail).toBeVisible();
  await expect(orderDetail.getByText("منتج اتصال حقيقي", { exact: false })).toBeVisible();
  await expect(orderDetail.getByText("عميل اتصال حقيقي", { exact: false })).toBeVisible();
  const transitionPromise = page.waitForResponse((response) => response.url().includes(`/api/platform/orders/${orderId}/state`) && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "نقل إلى CONFIRMED" }).click();
  const transitionResponse = await transitionPromise;
  expect(transitionResponse.status()).toBe(200);
  await expect(page.getByText(/تم تحديث الطلب إلى CONFIRMED/)).toBeVisible();
});
