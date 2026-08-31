const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
const concurrency = Math.min(
  Math.max(Number(process.env.LOAD_CONCURRENCY || 10), 1),
  100
);
const requestsPerWorker = Math.min(
  Math.max(Number(process.env.LOAD_REQUESTS || 20), 1),
  200
);
const paths = ["/api/health", "/api/observability", "/api/app-data"];

async function worker(workerId) {
  const results = [];
  for (let index = 0; index < requestsPerWorker; index += 1) {
    const path = paths[(workerId + index) % paths.length];
    const started = performance.now();
    try {
      const response = await fetch(new URL(path, baseUrl));
      results.push({
        ok: response.ok,
        latencyMs: performance.now() - started,
        path,
      });
      await response.arrayBuffer();
    } catch {
      results.push({ ok: false, latencyMs: performance.now() - started, path });
    }
  }
  return results;
}

const batches = await Promise.all(
  Array.from({ length: concurrency }, (_, workerId) => worker(workerId))
);
const results = batches.flat();
const failures = results.filter(result => !result.ok);
const latencies = results.map(result => result.latencyMs).sort((a, b) => a - b);
const percentile = value =>
  latencies[
    Math.min(latencies.length - 1, Math.floor(latencies.length * value))
  ] ?? 0;
const summary = {
  baseUrl,
  requests: results.length,
  concurrency,
  failures: failures.length,
  errorRate: results.length ? failures.length / results.length : 1,
  p50Ms: Math.round(percentile(0.5)),
  p95Ms: Math.round(percentile(0.95)),
};
if (failures.length || summary.errorRate > 0.01) {
  console.error(JSON.stringify({ status: "FAILED", ...summary }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "PASS", ...summary }));
}
