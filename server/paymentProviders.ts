export type PaymentProviderName = "paymob" | "fawry" | "vodafone_cash" | "instapay";
export type PaymentProviderStatus = "configured" | "requires_setup";

export type PaymentProvider = {
  name: PaymentProviderName;
  status: PaymentProviderStatus;
  createPaymentIntent(input: { amountCents: number; currency: string; reference: string }): Promise<{ status: "REQUIRES_ACTION" | "REQUIRES_SETUP"; providerReference?: string }>;
  refund(input: { providerReference: string; amountCents: number }): Promise<{ status: "REFUNDED" | "REQUIRES_SETUP" }>;
};

function isProviderName(value: string): value is PaymentProviderName {
  return ["paymob", "fawry", "vodafone_cash", "instapay"].includes(value);
}

export function resolvePaymentProvider(value: string): PaymentProvider {
  const name = isProviderName(value) ? value : "paymob";
  const configured = Boolean(process.env.PAYMENT_PROVIDER_API_KEY && process.env.PAYMENT_PROVIDER_API_URL);
  return {
    name,
    status: configured ? "configured" : "requires_setup",
    async createPaymentIntent() {
      if (!configured) return { status: "REQUIRES_SETUP" };
      // The adapter boundary is intentionally conservative until a provider-specific contract is configured.
      return { status: "REQUIRES_SETUP" };
    },
    async refund() {
      return { status: "REQUIRES_SETUP" };
    },
  };
}
