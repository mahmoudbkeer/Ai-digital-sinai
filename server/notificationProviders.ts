import { createSign } from "node:crypto";

export type NotificationChannel = "IN_APP" | "PUSH" | "SMS" | "EMAIL";
export type NotificationProviderStatus = "configured" | "requires_setup";
export type NotificationDeliveryStatus = "QUEUED" | "REQUIRES_SETUP" | "FAILED";

type NotificationInput = {
  recipientUserId: string;
  title: string;
  body: string;
  recipientEmail?: string;
  deviceToken?: string;
};

export type NotificationProvider = {
  channel: NotificationChannel;
  status: NotificationProviderStatus;
  enqueue(input: NotificationInput): Promise<{ status: NotificationDeliveryStatus; error?: string }>;
};

const timeoutMs = () => Number(process.env.NOTIFICATION_PROVIDER_TIMEOUT_MS ?? 10_000);

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function serviceAccount(): { project_id: string; client_email: string; private_key: string } | undefined {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return undefined;
    return { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return undefined;
  }
}

function fcmAccessToken(account: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${base64Url(signer.sign(account.private_key))}`;
  return fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
}

function configuredEndpoint(channel: NotificationChannel) {
  if (channel === "PUSH") {
    const account = serviceAccount();
    return Boolean(process.env.FCM_PROJECT_ID?.trim() && account);
  }
  if (channel === "EMAIL") return Boolean(process.env.EMAIL_PROVIDER_API_KEY?.trim() && process.env.NOTIFICATION_PROVIDER_API_URL?.trim());
  return channel === "IN_APP";
}

async function requestWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs());
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

async function enqueueFcm(input: NotificationInput): Promise<{ status: NotificationDeliveryStatus; error?: string }> {
  const account = serviceAccount();
  const projectId = process.env.FCM_PROJECT_ID?.trim() || account?.project_id;
  if (!projectId || !account || !input.deviceToken) return { status: "REQUIRES_SETUP", error: "FCM project, service account, and device token are required." };
  try {
    const privateKey = account.private_key;
    const tokenResponse = await requestWithTimeout("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await (async () => { const now = Math.floor(Date.now() / 1000); const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))}`; const signer = createSign("RSA-SHA256"); signer.update(unsigned); return `${unsigned}.${base64Url(signer.sign(privateKey))}`; })() }).toString() });
    if (!tokenResponse.ok) return { status: "FAILED", error: `FCM OAuth returned HTTP ${tokenResponse.status}.` };
    const tokenBody = await tokenResponse.json() as { access_token?: string };
    if (!tokenBody.access_token) return { status: "FAILED", error: "FCM OAuth response did not contain an access token." };
    const response = await requestWithTimeout(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, { method: "POST", headers: { authorization: `Bearer ${tokenBody.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ message: { token: input.deviceToken, notification: { title: input.title, body: input.body } } }) });
    if (!response.ok) return { status: "FAILED", error: `FCM returned HTTP ${response.status}.` };
    return { status: "QUEUED" };
  } catch (error) { return { status: "FAILED", error: error instanceof Error && error.name === "AbortError" ? "FCM request timeout." : "FCM request failed." }; }
}

async function enqueueGenericEmail(input: NotificationInput): Promise<{ status: NotificationDeliveryStatus; error?: string }> {
  const endpoint = process.env.NOTIFICATION_PROVIDER_API_URL;
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY?.trim();
  if (!apiKey || !endpoint || !input.recipientEmail) return { status: "REQUIRES_SETUP", error: "Email provider endpoint, key, and recipient email are required." };
  try {
    const response = await requestWithTimeout(endpoint, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ channel: "EMAIL", recipientEmail: input.recipientEmail, title: input.title, body: input.body }) });
    if (!response.ok) return { status: "FAILED", error: `Email provider returned HTTP ${response.status}.` };
    return { status: "QUEUED" };
  } catch (error) { return { status: "FAILED", error: error instanceof Error && error.name === "AbortError" ? "SendGrid request timeout." : "SendGrid request failed." }; }
}

export function resolveNotificationProvider(channel: NotificationChannel): NotificationProvider {
  const configured = configuredEndpoint(channel);
  return {
    channel,
    status: configured ? "configured" : "requires_setup",
    async enqueue(input) {
      if (channel === "IN_APP") return { status: "QUEUED" };
      if (!configured) return { status: "REQUIRES_SETUP" };
      if (channel === "PUSH") return enqueueFcm(input);
      if (channel === "EMAIL") return enqueueGenericEmail(input);
      return { status: "REQUIRES_SETUP", error: "SMS provider is intentionally not configured in this change." };
    },
  };
}
