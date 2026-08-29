import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentProvider = "paymob" | "fawry" | "vodafone_cash" | "instapay" | "card";

export type PaymentIntent = {
  id: string;
  provider: PaymentProvider;
  amountMinor: number;
  currency: string;
  reference: string;
};

export type VerifiedPaymentEvent = {
  eventId: string;
  provider: PaymentProvider;
  transactionId: string;
  kind: "payment.succeeded" | "payment.failed" | "payment.refunded";
  rawPayload: string;
};

/**
 * Provider-neutral boundary. Implementations must live behind a server-only
 * adapter and must never accept client-provided settlement status as proof.
 */
export interface PaymentGatewayAdapter {
  readonly provider: PaymentProvider;
  createPaymentIntent(input: { amountMinor: number; currency: string; reference: string }): Promise<PaymentIntent>;
  verifyWebhook(input: { payload: string; signature: string }): VerifiedPaymentEvent | null;
}

/**
 * Persistence boundary for replay protection. The production implementation
 * must use a durable unique key on eventId/provider; an in-memory set is not
 * sufficient for production and is intentionally not provided here.
 */
export interface PaymentEventRegistry {
  has(provider: PaymentProvider, eventId: string): Promise<boolean>;
  record(event: VerifiedPaymentEvent): Promise<void>;
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string) {
  if (!payload || !signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const provided = signature.replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/i.test(provided) || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"));
}

export async function acceptVerifiedPaymentEvent(
  event: VerifiedPaymentEvent,
  registry: PaymentEventRegistry,
): Promise<"accepted" | "replay"> {
  if (await registry.has(event.provider, event.eventId)) return "replay";
  await registry.record(event);
  return "accepted";
}

export function webhookUnavailable() {
  return {
    accepted: false as const,
    status: "unconfigured" as const,
    message: "Payment provider webhook is not configured; no transaction was settled.",
  };
}

export function settlementUnavailable() {
  return {
    settled: false as const,
    status: "verified-pending" as const,
    message: "Webhook verification is not payment settlement; configure a provider adapter and durable ledger first.",
  };
}
