import { getDataPlane } from "./dataPlane";
import { resolveNotificationProvider, type NotificationChannel } from "./notificationProviders";

export type NotificationJob = {
  type: "notification";
  id: string;
  tenantId: string;
  notificationId: string;
  deliveryId: string;
  userId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  recipientEmail?: string;
  deviceToken?: string;
  attempts?: number;
};

export async function processNotificationJob(job: NotificationJob) {
  const db = getDataPlane();
  const existing = (await db.prepare("SELECT status FROM notification_deliveries WHERE id = ? AND tenant_id = ?").get(job.deliveryId, job.tenantId)) as { status: string } | undefined;
  if (!existing) throw new Error("notification delivery not found");
  if (existing.status === "DELIVERED" || existing.status === "SENT") return { status: existing.status };

  const result = await resolveNotificationProvider(job.channel).enqueue({
    recipientUserId: job.userId,
    title: job.title,
    body: job.body,
    recipientEmail: job.recipientEmail,
    deviceToken: job.deviceToken,
  });
  if (result.status !== "QUEUED") {
    await db.prepare("UPDATE notification_deliveries SET status = 'FAILED', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").run(result.error ?? "Notification provider unavailable.", Date.now(), job.deliveryId, job.tenantId);
    throw new Error(result.error ?? "Notification provider unavailable.");
  }

  const deliveredStatus = job.channel === "IN_APP" ? "DELIVERED" : "SENT";
  await db.transaction(async () => {
    await db.prepare("UPDATE notification_deliveries SET status = ?, attempts = attempts + 1, last_error = NULL, next_attempt_at = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?").run(deliveredStatus, Date.now(), job.deliveryId, job.tenantId);
    await db.prepare("UPDATE notifications SET status = ? WHERE id = ? AND tenant_id = ?").run(deliveredStatus, job.notificationId, job.tenantId);
  });
  return { status: deliveredStatus };
}

export async function markNotificationDlq(job: NotificationJob, error: string) {
  const db = getDataPlane();
  await db.prepare("UPDATE notification_deliveries SET status = 'FAILED', last_error = ?, next_attempt_at = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?").run(error, Date.now(), job.deliveryId, job.tenantId);
  await db.prepare("UPDATE notifications SET status = 'FAILED' WHERE id = ? AND tenant_id = ?").run(job.notificationId, job.tenantId);
}

export async function markNotificationRetry(job: NotificationJob) {
  const db = getDataPlane();
  await db.prepare("UPDATE notification_deliveries SET status = 'QUEUED', next_attempt_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").run(Date.now(), Date.now(), job.deliveryId, job.tenantId);
}

export function isNotificationJob(value: unknown): value is NotificationJob {
  return Boolean(value && typeof value === "object" && (value as { type?: unknown }).type === "notification");
}
