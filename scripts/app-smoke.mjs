import { spawn } from "node:child_process";

const ownsServer = !process.env.BASE_URL;
const port = process.env.SMOKE_PORT || "4317";
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;
let server;

if (ownsServer) {
  server = spawn(process.execPath, ["dist/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("smoke server did not start in time")), 10_000);
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Server running")) { clearTimeout(timer); resolve(); }
    });
    server.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

try {
  const checks = [
    ["app shell", "/"],
    ["health", "/api/health"],
    ["app data", "/api/app-data"],
  ];

  for (const [label, path] of checks) {
    const response = await fetch(new URL(path, baseUrl));
    if (!response.ok) throw new Error(`${label} failed with ${response.status}`);
    if (path === "/" && !(await response.text()).includes("AI DIGITAL")) throw new Error("app shell does not contain brand marker");
    if (path !== "/") {
      const type = response.headers.get("content-type") || "";
      if (!type.includes("application/json")) throw new Error(`${label} did not return JSON`);
      await response.json();
    }
  }
  console.log(`App smoke passed: ${checks.length} checks at ${baseUrl}`);
} finally {
  if (server) server.kill("SIGTERM");
}
