import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { acceptVerifiedPaymentEvent, settlementUnavailable, verifyWebhookSignature, type PaymentEventRegistry, type VerifiedPaymentEvent } from "./payment";

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
});

describe("payment event safety", () => {
  it("accepts an event once and rejects replay through the registry boundary", async () => {
    const seen = new Set<string>();
    const registry: PaymentEventRegistry = {
      has: async (provider, eventId) => seen.has(`${provider}:${eventId}`),
      record: async (event: VerifiedPaymentEvent) => {
        seen.add(`${event.provider}:${event.eventId}`);
      },
    };
    const event: VerifiedPaymentEvent = {
      eventId: "evt_1",
      provider: "card",
      transactionId: "txn_1",
      kind: "payment.succeeded",
      rawPayload: "{}",
    };

    await expect(acceptVerifiedPaymentEvent(event, registry)).resolves.toBe("accepted");
    await expect(acceptVerifiedPaymentEvent(event, registry)).resolves.toBe("replay");
  });

  it("keeps settlement disabled until a real adapter and ledger are configured", () => {
    expect(settlementUnavailable()).toMatchObject({ settled: false, status: "verified-pending" });
  });
});
