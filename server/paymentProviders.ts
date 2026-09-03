export type PaymentProviderName = "paymob" | "fawry" | "vodafone_cash" | "instapay" | "kashier";
export type PaymentProviderStatus = "configured" | "requires_setup";
export type PaymentResult = {
  status: "REQUIRES_ACTION" | "REQUIRES_SETUP" | "FAILED";
  providerReference?: string;
  paymentUrl?: string;
  qrPayload?: string;
  error?: string;
};
export type PaymentProvider = {
  name: PaymentProviderName;
  status: PaymentProviderStatus;
  createPaymentIntent(input: { amountCents: number; currency: string; reference: string }): Promise<PaymentResult>;
  createPaymentRequest(input: { amountCents: number; currency: string; reference: string; callbackUrl?: string }): Promise<PaymentResult>;
  refund(input: { providerReference: string; amountCents: number }): Promise<{ status: "REFUNDED" | "REQUIRES_SETUP" | "FAILED"; error?: string }>;
};

function isProviderName(value: string): value is PaymentProviderName {
  return ["paymob", "fawry", "vodafone_cash", "instapay", "kashier"].includes(value);
}

function configuredFor(name: PaymentProviderName) {
  const prefix = name.toUpperCase().replace("_", "_");
  return { url: process.env[`${prefix}_API_URL`]?.trim() || process.env.PAYMENT_PROVIDER_API_URL?.trim(), key: process.env[`${prefix}_API_KEY`]?.trim() || process.env.PAYMENT_PROVIDER_API_KEY?.trim() };
}

function kashierConfig() {
  const mode = (process.env.KASHIER_MODE?.trim().toLowerCase() || "test") as "test" | "live";
  const apiUrl = process.env.KASHIER_API_URL?.trim() || "https://api.kashier.io";
  const sessionsPath = process.env.KASHIER_PAYMENT_SESSIONS_PATH?.trim() || "/v1/payment-sessions";
  return { mode: mode === "live" ? "live" : "test", apiUrl, sessionsPath, mid: process.env.KASHIER_MID?.trim(), apiKey: process.env.KASHIER_API_KEY?.trim() };
}

async function postJson(url: string, key: string, body: unknown, headers: Record<string, string> = {}) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Number(process.env.PAYMENT_PROVIDER_TIMEOUT_MS ?? 8000));
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...headers }, body: JSON.stringify(body), signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { response, payload };
  } finally { clearTimeout(timer); }
}

function nestedString(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (typeof payload[key] === "string" && payload[key]) return payload[key] as string;
  const data = payload.data;
  if (data && typeof data === "object") {
    for (const key of keys) if (typeof (data as Record<string, unknown>)[key] === "string" && (data as Record<string, unknown>)[key]) return (data as Record<string, unknown>)[key] as string;
  }
  return undefined;
}

function createKashierProvider(): PaymentProvider {
  const config = kashierConfig();
  const configured = Boolean(config.mid && config.apiKey);
  const createSession = async (input: { amountCents: number; currency: string; reference: string; callbackUrl?: string }): Promise<PaymentResult> => {
    if (!configured) return { status: "REQUIRES_SETUP" };
    try {
      const { response, payload } = await postJson(`${config.apiUrl.replace(/\/$/, "")}${config.sessionsPath.startsWith("/") ? config.sessionsPath : `/${config.sessionsPath}`}`, config.apiKey!, {
        merchantId: config.mid,
        amount: (input.amountCents / 100).toFixed(2),
        currency: input.currency,
        merchantOrderId: input.reference,
        mode: config.mode,
        merchantRedirect: input.callbackUrl,
      }, { "x-api-key": config.apiKey!, "x-merchant-id": config.mid! });
      const providerReference = nestedString(payload, "id", "sessionId", "session_id", "providerReference", "orderId");
      const paymentUrl = nestedString(payload, "sessionUrl", "session_url", "paymentUrl", "payment_url", "url");
      if (!response.ok || !providerReference || !paymentUrl) return { status: "FAILED", error: typeof payload.error === "string" ? payload.error : `Kashier returned HTTP ${response.status} without a payment session.` };
      return { status: "REQUIRES_ACTION", providerReference, paymentUrl, qrPayload: paymentUrl };
    } catch (error) { return { status: "FAILED", error: error instanceof Error ? error.message : String(error) }; }
  };
  return { name: "kashier", status: configured ? "configured" : "requires_setup", createPaymentIntent: createSession, createPaymentRequest: createSession, async refund() { return configured ? { status: "FAILED", error: "Kashier refunds are not enabled by this adapter yet." } : { status: "REQUIRES_SETUP" }; } };
}

export function resolvePaymentProvider(value: string): PaymentProvider {
  const name = isProviderName(value) ? value : "paymob";
  if (name === "kashier") return createKashierProvider();
  const config = configuredFor(name); const configured = Boolean(config.url && config.key);
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
    async createPaymentRequest(input) { return this.createPaymentIntent(input); },
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

export function paymentProviderWebhookSecret(provider: string) {
  return provider === "kashier" ? process.env.KASHIER_API_KEY?.trim() : process.env.PAYMENT_WEBHOOK_SECRET?.trim();
}
