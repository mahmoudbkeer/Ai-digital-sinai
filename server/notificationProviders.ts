export type NotificationChannel = "IN_APP" | "PUSH" | "SMS" | "EMAIL";
export type NotificationProviderStatus = "configured" | "requires_setup";
export type NotificationDeliveryStatus = "QUEUED" | "REQUIRES_SETUP" | "FAILED";

export type NotificationProvider = {
  channel: NotificationChannel;
  status: NotificationProviderStatus;
  enqueue(input: {
    recipientUserId: string;
    title: string;
    body: string;
  }): Promise<{ status: NotificationDeliveryStatus; error?: string }>;
};

export function resolveNotificationProvider(
  channel: NotificationChannel
): NotificationProvider {
  const envKey =
    channel === "EMAIL"
      ? "EMAIL_PROVIDER_API_KEY"
      : channel === "SMS"
        ? "SMS_PROVIDER_API_KEY"
        : channel === "PUSH"
          ? "PUSH_PROVIDER_API_KEY"
          : undefined;
  const endpoint = process.env.NOTIFICATION_PROVIDER_API_URL;
  const configured =
    channel === "IN_APP" || Boolean(envKey && process.env[envKey] && endpoint);
  return {
    channel,
    status: configured ? "configured" : "requires_setup",
    async enqueue(input) {
      if (channel === "IN_APP") return { status: "QUEUED" };
      if (!configured || !endpoint) return { status: "REQUIRES_SETUP" };
      const key = envKey ? process.env[envKey] : undefined;
      if (!key) return { status: "REQUIRES_SETUP" };
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Number(process.env.NOTIFICATION_PROVIDER_TIMEOUT_MS ?? 10_000)
      );
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ channel, ...input }),
          signal: controller.signal,
        });
        if (!response.ok)
          return {
            status: "FAILED",
            error: `Notification provider returned HTTP ${response.status}.`,
          };
        return { status: "QUEUED" };
      } catch (error) {
        return {
          status: "FAILED",
          error:
            error instanceof Error && error.name === "AbortError"
              ? "Notification provider timeout."
              : "Notification provider request failed.",
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
