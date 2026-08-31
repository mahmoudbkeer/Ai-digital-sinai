import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:3000",
    headless: true,
    launchOptions: { executablePath: "/usr/bin/chromium" },
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
  },
});
