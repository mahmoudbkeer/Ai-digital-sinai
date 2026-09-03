import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePaymentProvider } from "./paymentProviders";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Kashier payment provider", () => {
  it("remains REQUIRES_SETUP without real merchant credentials", async () => {
    vi.stubEnv("KASHIER_MID", "");
    vi.stubEnv("KASHIER_API_KEY", "");
    const provider = resolvePaymentProvider("kashier");
    expect(provider.status).toBe("requires_setup");
    await expect(provider.createPaymentRequest({ amountCents: 1250, currency: "EGP", reference: "intent-setup" })).resolves.toEqual({ status: "REQUIRES_SETUP" });
  });

  it("creates a hosted payment session and exposes URL/QR payload from a mock API", async () => {
    vi.stubEnv("KASHIER_MID", "MID-test-123");
    vi.stubEnv("KASHIER_API_KEY", "test-api-key");
    vi.stubEnv("KASHIER_MODE", "test");
    vi.stubEnv("KASHIER_API_URL", "https://sandbox.kashier.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "ks-session-1", sessionUrl: "https://checkout.kashier.test/session/1" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolvePaymentProvider("kashier").createPaymentRequest({ amountCents: 1250, currency: "EGP", reference: "intent-1" });
    expect(result).toEqual({ status: "REQUIRES_ACTION", providerReference: "ks-session-1", paymentUrl: "https://checkout.kashier.test/session/1", qrPayload: "https://checkout.kashier.test/session/1" });
    expect(fetchMock).toHaveBeenCalledWith("https://sandbox.kashier.test/v1/payment-sessions", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-api-key": "test-api-key", "x-merchant-id": "MID-test-123" }) }));
  });
});
