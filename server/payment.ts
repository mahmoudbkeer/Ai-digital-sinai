import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(payload: string, signature: string, secret: string) {
  if (!payload || !signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const provided = signature.replace(/^sha256=/, "");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"));
}

/** Kashier signs callback fields as an ordered query string, excluding signature and mode. */
export function verifyKashierWebhookSignature(payload: string, signature: string, secret: string) {
  if (!payload || !signature || !secret) return false;
  let fields: Record<string, unknown>;
  try {
    const parsed = JSON.parse(payload) as unknown;
    fields = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    fields = Object.fromEntries(new URLSearchParams(payload).entries());
  }
  const orderedKeys = ["paymentStatus", "cardDataToken", "maskedCard", "merchantOrderId", "orderId", "cardBrand", "orderReference", "transactionId", "amount", "currency"];
  const canonical = orderedKeys
    .filter(key => fields[key] !== undefined && fields[key] !== null)
    .map(key => `${key}=${String(fields[key])}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(canonical).digest("hex");
  const provided = signature.replace(/^sha256=/, "");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"));
}

export function webhookUnavailable() {
  return { accepted: false as const, status: "unconfigured" as const, message: "Payment provider webhook is not configured; no transaction was settled." };
}
