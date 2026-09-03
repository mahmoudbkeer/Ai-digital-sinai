import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveNotificationProvider } from "./notificationProviders";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("FCM notification provider", () => {
  it("stays REQUIRES_SETUP without project credentials", async () => {
    const provider = resolveNotificationProvider("PUSH");
    expect(provider.status).toBe("requires_setup");
    await expect(provider.enqueue({ recipientUserId: "u1", title: "Test", body: "Body", deviceToken: "token" })).resolves.toMatchObject({ status: "REQUIRES_SETUP" });
  });
  it("does not fabricate delivery when the service account key is invalid", async () => {
    vi.stubEnv("FCM_PROJECT_ID", "test-project");
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", JSON.stringify({ project_id: "test-project", client_email: "sender@test-project.iam.gserviceaccount.com", private_key: "not-a-real-key" }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveNotificationProvider("PUSH").enqueue({ recipientUserId: "u1", title: "Test", body: "Body", deviceToken: "device-token" })).resolves.toMatchObject({ status: "FAILED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SendGrid email provider", () => {
  it("stays REQUIRES_SETUP without credentials", async () => {
    expect(resolveNotificationProvider("EMAIL").status).toBe("requires_setup");
    await expect(resolveNotificationProvider("EMAIL").enqueue({ recipientUserId: "u1", recipientEmail: "user@example.com", title: "Test", body: "Body" })).resolves.toMatchObject({ status: "REQUIRES_SETUP" });
  });
  it("posts the SendGrid v3 mail contract and only reports queued on HTTP 202", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveNotificationProvider("EMAIL").enqueue({ recipientUserId: "u1", recipientEmail: "user@example.com", title: "Subject", body: "Body" })).resolves.toEqual({ status: "QUEUED" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.sendgrid.com/v3/mail/send", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer SG.test-key" }), body: expect.stringContaining("user@example.com") }));
  });
});
