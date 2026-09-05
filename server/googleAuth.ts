import { type AsyncDataPlane } from "./dataPlane";

export type GoogleIdentity = {
  subject: string;
  email: string;
  name: string;
  picture?: string;
};

export type GoogleAuthResult =
  | { status: "REQUIRES_SETUP"; message: string }
  | { status: "INVALID"; message: string }
  | { status: "VERIFIED"; identity: GoogleIdentity };

/**
 * Verifies a Google ID token through Google's tokeninfo endpoint and checks
 * the configured server client ID. No client secret is exposed to clients.
 */
export async function verifyGoogleIdToken(idToken: unknown): Promise<GoogleAuthResult> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    return {
      status: "REQUIRES_SETUP",
      message: "Google Sign-In requires GOOGLE_OAUTH_CLIENT_ID setup.",
    };
  }
  if (typeof idToken !== "string" || idToken.length < 32 || idToken.length > 8192) {
    return { status: "INVALID", message: "A valid Google ID token is required." };
  }
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!response.ok) return { status: "INVALID", message: "Google ID token verification failed." };
    const payload = await response.json() as Record<string, unknown>;
    const audience = String(payload.aud ?? "");
    const issuer = String(payload.iss ?? "");
    const email = String(payload.email ?? "").trim().toLowerCase();
    const subject = String(payload.sub ?? "").trim();
    const emailVerified = String(payload.email_verified ?? "").toLowerCase() === "true";
    const expiresAt = Number(payload.exp ?? 0);
    if (audience !== clientId || !["accounts.google.com", "https://accounts.google.com"].includes(issuer) || !email || !subject || !emailVerified || !Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
      return { status: "INVALID", message: "Google ID token claims are not acceptable." };
    }
    return {
      status: "VERIFIED",
      identity: {
        subject,
        email,
        name: String(payload.name ?? email.split("@")[0]).slice(0, 160),
        picture: typeof payload.picture === "string" ? payload.picture : undefined,
      },
    };
  } catch {
    return { status: "INVALID", message: "Google ID token verification is unavailable." };
  }
}

export async function findUserByEmail(db: AsyncDataPlane, email: string) {
  return (await db.prepare("SELECT id FROM users WHERE email = ? AND status = 'active'").get(email)) as { id: string } | undefined;
}
