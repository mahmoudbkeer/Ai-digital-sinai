#!/usr/bin/env node
import { resolveRedisProvider } from "../server/integrations.ts";
import { isNotificationJob, markNotificationDlq, markNotificationRetry, processNotificationJob } from "../server/notificationWorker.ts";

const queue = process.env.WORKER_QUEUE ?? "default";
const dlq = `${queue}.dlq`;
const maxAttempts = Math.min(Math.max(Number(process.env.WORKER_MAX_ATTEMPTS ?? 3), 1), 10);
const once = process.env.WORKER_ONCE === "1";
const redis = resolveRedisProvider();
if (redis.status !== "configured" && process.env.NODE_ENV === "production") {
  console.error(JSON.stringify({ status: "REQUIRES_SETUP", queue, message: "Production workers require REDIS_URL." }));
  process.exit(78);
}
let processed = 0;
async function handle(raw) {
  let job;
  try { job = JSON.parse(raw); } catch { job = { payload: raw }; }
  const attempts = Number(job.attempts ?? 0) + 1;
  if (!job.id) job.id = `${Date.now()}-${processed}`;
  try {
    if (job.fail === true) throw new Error("job requested failure");
    const result = isNotificationJob(job)
      ? await processNotificationJob(job)
      : { status: "PROCESSED" };
    processed += 1;
    console.log(JSON.stringify({ status: result.status === "DELIVERED" ? "DELIVERED" : "PROCESSED", queue, jobId: job.id, attempts }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isNotificationJob(job) && attempts < maxAttempts) await markNotificationRetry(job);
    if (attempts < maxAttempts) {
      await redis.enqueue(queue, JSON.stringify({ ...job, attempts }), 86_400);
      console.error(JSON.stringify({ status: "RETRY_QUEUED", queue, jobId: job.id, attempts }));
    } else {
      if (isNotificationJob(job)) await markNotificationDlq(job, message);
      await redis.enqueue(dlq, JSON.stringify({ ...job, attempts, error: message }), 2_592_000);
      console.error(JSON.stringify({ status: "DLQ", queue, jobId: job.id, attempts }));
    }
  }
}
while (true) {
  const raw = await redis.dequeue(queue);
  if (raw) await handle(raw);
  else if (once || processed > 0) break;
  else await new Promise(resolve => setTimeout(resolve, Number(process.env.WORKER_POLL_MS ?? 250)));
}
console.log(JSON.stringify({ status: "STOPPED", queue, processed }));
