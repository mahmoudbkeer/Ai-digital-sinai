import { createHash, randomInt, randomUUID } from "node:crypto";
import type { AsyncDataPlane } from "./dataPlane";
import { resolveNotificationProvider } from "./notificationProviders";

const CODE_TTL_MS = 15 * 60 * 1000;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export type EmailVerificationResult = {
  status: "QUEUED" | "REQUIRES_SETUP" | "FAILED";
  expiresAt: number;
};

export async function issueEmailVerification(
  db: AsyncDataPlane,
  userId: string,
  email: string,
  displayName: string,
  nowMs = Date.now(),
): Promise<EmailVerificationResult> {
  const code = randomInt(100000, 1000000).toString();
  const expiresAt = nowMs + CODE_TTL_MS;
  await db.prepare("DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL").run(userId);
  await db.prepare("INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)").run(randomUUID(), userId, hashCode(code), expiresAt, nowMs);
  const provider = resolveNotificationProvider("EMAIL");
  const delivery = await provider.enqueue({
    recipientUserId: userId,
    recipientEmail: email,
    title: "رمز تفعيل حساب AI Digital Sinai",
    body: `مرحباً ${displayName}، رمز تفعيل حسابك هو ${code}. ينتهي خلال 15 دقيقة. إذا لم تطلب هذا الرمز فتجاهل الرسالة.`,
  });
  return { status: delivery.status, expiresAt };
}

export async function verifyEmailCode(
  db: AsyncDataPlane,
  email: string,
  code: string,
  nowMs = Date.now(),
): Promise<{ userId: string } | { error: "invalid" | "expired" | "locked" }> {
  const record = await db.prepare("SELECT t.id, t.user_id, t.token_hash, t.expires_at, t.used_at, t.attempts, u.status FROM email_verification_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = ? ORDER BY t.created_at DESC LIMIT 1").get(email) as { id: string; user_id: string; token_hash: string; expires_at: number; used_at: number | null; attempts: number; status: string } | undefined;
  if (!record || record.used_at || record.expires_at < nowMs) return { error: "expired" };
  if (record.attempts >= 5) return { error: "locked" };
  await db.prepare("UPDATE email_verification_tokens SET attempts = attempts + 1 WHERE id = ?").run(record.id);
  if (!/^[0-9]{6}$/.test(code) || hashCode(code) !== record.token_hash) return { error: "invalid" };
  await db.prepare("UPDATE email_verification_tokens SET used_at = ? WHERE id = ?").run(nowMs, record.id);
  await db.prepare("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?").run(nowMs, record.user_id);
  return { userId: record.user_id };
}
