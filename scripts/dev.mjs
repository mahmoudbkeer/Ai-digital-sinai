import { spawn } from "node:child_process";

const apiPort = process.env.API_PORT || "4318";
const commonEnv = { ...process.env };
const api = spawn("pnpm", ["exec", "tsx", "server/index.ts"], {
  cwd: process.cwd(),
  env: { ...commonEnv, PORT: apiPort },
  stdio: "inherit",
});
const vite = spawn("pnpm", ["exec", "vite", "--host"], {
  cwd: process.cwd(),
  env: { ...commonEnv, API_PORT: apiPort },
  stdio: "inherit",
});

const stop = (code = 0) => {
  api.kill("SIGTERM");
  vite.kill("SIGTERM");
  process.exit(code);
};
api.on("exit", (code) => { if (code && code !== 143) stop(code); });
vite.on("exit", (code) => { if (code && code !== 143) stop(code); });
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
