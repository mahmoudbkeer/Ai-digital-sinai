import { expect, test } from "@playwright/test";

test("Customers security E2E: authentication and tenant isolation", async ({ request }) => {
  const unauthenticated = await request.get("/api/platform/customers");
  expect(unauthenticated.status()).toBe(401);

  const register = async (suffix: string) => {
    const response = await request.post("/api/platform/auth/register", {
      data: {
        email: `e2e-customers-security-${suffix}-${Date.now()}@example.test`,
        password: "secure-password-123",
        displayName: `Customers Security ${suffix}`,
        tenantName: `Customers Security Tenant ${suffix}`,
      },
    });
    expect(response.status()).toBe(201);
    return response.json() as Promise<{ token: string; tenantId: string }>;
  };

  const tenantA = await register("a");
  const tenantB = await register("b");
  const headersA = { authorization: `Bearer ${tenantA.token}`, "x-tenant-id": tenantA.tenantId };
  const headersB = { authorization: `Bearer ${tenantB.token}`, "x-tenant-id": tenantB.tenantId };

  const created = await request.post("/api/platform/customers", { headers: headersA, data: { name: "عميل عزل E2E", email: "isolation-e2e@example.test" } });
  expect(created.status()).toBe(201);
  const { customerId } = await created.json() as { customerId: string };

  const listB = await request.get("/api/platform/customers", { headers: headersB });
  expect(listB.status()).toBe(200);
  await expect(listB.json()).resolves.toMatchObject({ customers: [] });

  expect((await request.get(`/api/platform/customers/${customerId}/history`, { headers: headersB })).status()).toBe(404);
  expect((await request.post(`/api/platform/customers/${customerId}/interactions`, { headers: headersB, data: { interactionType: "NOTE", note: "cross tenant" } })).status()).toBe(404);
  expect((await request.post(`/api/platform/customers/${customerId}/tags`, { headers: headersB, data: { name: "cross-tenant" } })).status()).toBe(404);

  const historyA = await request.get(`/api/platform/customers/${customerId}/history`, { headers: headersA });
  expect(historyA.status()).toBe(200);
});
