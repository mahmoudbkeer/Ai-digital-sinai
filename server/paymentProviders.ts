export type PaymentProviderName = "paymob" | "fawry" | "vodafone_cash" | "instapay";
export type PaymentProviderStatus = "configured" | "requires_setup";
export type PaymentProvider = {
  name: PaymentProviderName;
  status: PaymentProviderStatus;
  createPaymentIntent(input: { amountCents: number; currency: string; reference: string }): Promise<{ status: "REQUIRES_ACTION" | "REQUIRES_SETUP" | "FAILED"; providerReference?: string; error?: string }>;
  refund(input: { providerReference: string; amountCents: number }): Promise<{ status: "REFUNDED" | "REQUIRES_SETUP" | "FAILED"; error?: string }>;
};
function isProviderName(value: string): value is PaymentProviderName { return ["paymob", "fawry", "vodafone_cash", "instapay"].includes(value); }
function configuredFor(name: PaymentProviderName) {
  const prefix = name.toUpperCase().replace("_", "_");
  return { url: process.env[`${prefix}_API_URL`]?.trim() || process.env.PAYMENT_PROVIDER_API_URL?.trim(), key: process.env[`${prefix}_API_KEY`]?.trim() || process.env.PAYMENT_PROVIDER_API_KEY?.trim() };
}
async function postJson(url: string, key: string, body: unknown) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Number(process.env.PAYMENT_PROVIDER_TIMEOUT_MS ?? 8000));
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { response, payload };
  } finally { clearTimeout(timer); }
}
export function resolvePaymentProvider(value: string): PaymentProvider {
  const name = isProviderName(value) ? value : "paymob"; const config = configuredFor(name); const configured = Boolean(config.url && config.key);
  return {
    name, status: configured ? "configured" : "requires_setup",
    async createPaymentIntent(input) {
      if (!configured) return { status: "REQUIRES_SETUP" };
      try {
        const { response, payload } = await postJson(`${config.url!.replace(/\/$/, "")}/payments/intents`, config.key!, { amountCents: input.amountCents, currency: input.currency, reference: input.reference, provider: name });
        const providerReference = typeof payload.providerReference === "string" ? payload.providerReference : typeof payload.id === "string" ? payload.id : undefined;
        if (!response.ok || !providerReference) return { status: "FAILED", error: typeof payload.error === "string" ? payload.error : `Provider returned HTTP ${response.status}.` };
        return { status: "REQUIRES_ACTION", providerReference };
      } catch (error) { return { status: "FAILED", error: error instanceof Error ? error.message : String(error) }; }
    },
    async refund(input) {
      if (!configured) return { status: "REQUIRES_SETUP" };
      try {
        const { response, payload } = await postJson(`${config.url!.replace(/\/$/, "")}/payments/refunds`, config.key!, input);
        if (!response.ok || payload.status !== "REFUNDED") return { status: "FAILED", error: typeof payload.error === "string" ? payload.error : `Provider returned HTTP ${response.status}.` };
        return { status: "REFUNDED" };
      } catch (error) { return { status: "FAILED", error: error instanceof Error ? error.message : String(error) }; }
    },
  };
}
