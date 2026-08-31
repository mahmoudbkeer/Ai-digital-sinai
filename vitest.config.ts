import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "client/src"), "@shared": path.resolve(__dirname, "shared") } },
  test: { include: ["server/**/*.test.ts"], server: { deps: { external: ["node:sqlite"] } } },
});
