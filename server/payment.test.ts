import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./payment";

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
