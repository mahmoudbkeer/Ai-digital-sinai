import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(payload: string, signature: string, secret: string) {
  if (!payload || !signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const provided = signature.replace(/^sha256=/, "");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"));
}

export function webhookUnavailable() {
  return { accepted: false as const, status: "unconfigured" as const, message: "Payment provider webhook is not configured; no transaction was settled." };
}
