export type NotificationChannel = "IN_APP" | "PUSH" | "SMS" | "EMAIL";
export type NotificationProviderStatus = "configured" | "requires_setup";

export type NotificationProvider = {
  channel: NotificationChannel;
  status: NotificationProviderStatus;
  enqueue(input: { recipientUserId: string; title: string; body: string }): Promise<{ status: "QUEUED" | "REQUIRES_SETUP" }>;
};

export function resolveNotificationProvider(channel: NotificationChannel): NotificationProvider {
  const envKey = channel === "EMAIL" ? "EMAIL_PROVIDER_API_KEY" : channel === "SMS" ? "SMS_PROVIDER_API_KEY" : channel === "PUSH" ? "PUSH_PROVIDER_API_KEY" : undefined;
  const configured = channel === "IN_APP" || Boolean(envKey && process.env[envKey]);
  return {
    channel,
    status: configured ? "configured" : "requires_setup",
    async enqueue() { return { status: configured ? "QUEUED" : "REQUIRES_SETUP" }; },
  };
}
