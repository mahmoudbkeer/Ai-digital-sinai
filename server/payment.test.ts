import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyWebhookSignature } from "./payment";
import { resolvePaymentProvider } from "./paymentProviders";

afterEach(() => vi.unstubAllEnvs());

describe("payment webhook signature", () => {
  it("accepts a valid HMAC signature", () => {
    const payload = JSON.stringify({ event: "payment.succeeded", id: "evt_1" });
    const secret = "test-secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it("rejects tampered payloads and malformed signatures", () => {
    const payload = "{\"event\":\"payment.succeeded\"}";
    const secret = "test-secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifyWebhookSignature(`${payload}x`, signature, secret)).toBe(false);
    expect(verifyWebhookSignature(payload, "bad", secret)).toBe(false);
  });

  it("accepts the provider-style sha256 prefix and rejects empty inputs", () => {
    const payload = "{\"event\":\"payment.updated\"}";
    const secret = "test-secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifyWebhookSignature(payload, `sha256=${signature}`, secret)).toBe(true);
    expect(verifyWebhookSignature("", signature, secret)).toBe(false);
    expect(verifyWebhookSignature(payload, "", secret)).toBe(false);
  });
});

describe("payment provider HTTP contract", () => {
  it("returns the provider reference only from a verified provider response", async () => {
    vi.stubEnv("PAYMOB_API_URL", "https://sandbox.paymob.invalid");
    vi.stubEnv("PAYMOB_API_KEY", "sandbox-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "pi_123" }), { status: 201, headers: { "content-type": "application/json" } })));
    const provider = resolvePaymentProvider("paymob");
    await expect(provider.createPaymentIntent({ amountCents: 100, currency: "EGP", reference: "order-1" })).resolves.toMatchObject({ status: "REQUIRES_ACTION", providerReference: "pi_123" });
    expect(fetch).toHaveBeenCalledWith("https://sandbox.paymob.invalid/payments/intents", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer sandbox-key" }) }));
  });

  it("does not claim payment success when the provider is unavailable or malformed", async () => {
    vi.stubEnv("PAYMOB_API_URL", "https://sandbox.paymob.invalid");
    vi.stubEnv("PAYMOB_API_KEY", "sandbox-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(resolvePaymentProvider("paymob").createPaymentIntent({ amountCents: 100, currency: "EGP", reference: "order-2" })).resolves.toMatchObject({ status: "FAILED" });
  });
});
