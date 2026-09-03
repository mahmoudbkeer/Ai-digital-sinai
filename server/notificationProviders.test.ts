import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveNotificationProvider } from "./notificationProviders";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("FCM notification provider", () => {
  it("stays REQUIRES_SETUP without project credentials", async () => {
    const provider = resolveNotificationProvider("PUSH");
    expect(provider.status).toBe("requires_setup");
    await expect(provider.enqueue({ recipientUserId: "u1", title: "Test", body: "Body", deviceToken: "token" })).resolves.toMatchObject({ status: "REQUIRES_SETUP" });
  });

  it("uses OAuth JWT then FCM HTTP v1 without fabricating delivery", async () => {
    vi.stubEnv("FCM_PROJECT_ID", "test-project");
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", JSON.stringify({ project_id: "test-project", client_email: "sender@test-project.iam.gserviceaccount.com", private_key: "not-a-real-key" }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "mock-access-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "projects/test-project/messages/1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    // The malformed key must fail before any success is claimed.
    await expect(resolveNotificationProvider("PUSH").enqueue({ recipientUserId: "u1", title: "Test", body: "Body", deviceToken: "device-token" })).resolves.toMatchObject({ status: "FAILED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
