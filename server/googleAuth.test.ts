import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyGoogleIdToken } from "./googleAuth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Google Sign-In setup and token boundary", () => {
  it("returns REQUIRES_SETUP when the server client ID is absent", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    await expect(verifyGoogleIdToken("a-valid-looking-token-value-that-is-long-enough")).resolves.toMatchObject({ status: "REQUIRES_SETUP" });
  });

  it("rejects malformed tokens before making a remote verification call", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "web-client.apps.googleusercontent.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(verifyGoogleIdToken("short")).resolves.toMatchObject({ status: "INVALID" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts only verified tokens with the configured audience and issuer", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "web-client.apps.googleusercontent.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      aud: "web-client.apps.googleusercontent.com",
      iss: "https://accounts.google.com",
      email: "owner@example.com",
      email_verified: "true",
      sub: "google-subject-1",
      name: "Owner",
      exp: Math.floor(Date.now() / 1000) + 300,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(verifyGoogleIdToken("a-valid-looking-token-value-that-is-long-enough")).resolves.toMatchObject({ status: "VERIFIED", identity: { email: "owner@example.com", subject: "google-subject-1" } });
  });
});
