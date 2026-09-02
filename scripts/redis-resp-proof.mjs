import { resolveRedisProvider } from "../server/integrations.ts";

const redis = resolveRedisProvider();
const payload = JSON.stringify({ proof: "resp-framing", at: Date.now() });
const queued = await redis.enqueue("notifications-proof", payload, 60);
const dequeued = await redis.dequeue("notifications-proof");
console.log(JSON.stringify({ redisStatus: redis.status, queued, dequeued, matches: dequeued === payload }));
if (redis.status !== "configured" || queued !== "QUEUED" || dequeued !== payload) process.exit(1);
