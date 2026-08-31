export type AIProviderStatus = "configured" | "requires_setup";

export type AICompletion = {
  status: "COMPLETED" | "REQUIRES_SETUP" | "FAILED";
  output?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costCents?: number | null;
  error?: string;
};

export type AIProvider = {
  name: string;
  status: AIProviderStatus;
  complete(input: {
    purpose: string;
    prompt: string;
    tenantId: string;
    allowedDataScope: string[];
  }): Promise<AICompletion>;
};

function validHttpUrl(value: string | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function nonNegativeInteger(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

export function resolveAIProvider(): AIProvider {
  const endpoint = process.env.AI_PROVIDER_API_URL;
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  const configured = validHttpUrl(endpoint) && Boolean(apiKey);
  return {
    name: process.env.AI_PROVIDER_NAME ?? "generic-json",
    status: configured ? "configured" : "requires_setup",
    async complete(input) {
      if (!configured || !endpoint || !apiKey)
        return {
          status: "REQUIRES_SETUP",
          error: "AI provider credentials are not configured.",
        };
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 15_000)
      );
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "x-tenant-scope": input.tenantId,
          },
          body: JSON.stringify({
            purpose: input.purpose,
            prompt: input.prompt,
            tenantId: input.tenantId,
            allowedDataScope: input.allowedDataScope,
          }),
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (!response.ok)
          return {
            status: "FAILED",
            error:
              typeof payload?.error === "string"
                ? payload.error.slice(0, 500)
                : `AI provider returned HTTP ${response.status}.`,
          };
        const output =
          typeof payload?.output === "string" ? payload.output.trim() : "";
        if (!output || output.length > 100_000)
          return {
            status: "FAILED",
            error: "AI provider response failed output validation.",
          };
        return {
          status: "COMPLETED",
          output,
          model:
            typeof payload?.model === "string"
              ? payload.model.slice(0, 120)
              : "provider-default",
          inputTokens: nonNegativeInteger(payload?.inputTokens),
          outputTokens: nonNegativeInteger(payload?.outputTokens),
          totalTokens: nonNegativeInteger(payload?.totalTokens),
          costCents:
            payload?.costCents == null
              ? null
              : nonNegativeInteger(payload.costCents),
        };
      } catch (error) {
        return {
          status: "FAILED",
          error:
            error instanceof Error && error.name === "AbortError"
              ? "AI provider timeout."
              : "AI provider request failed.",
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
