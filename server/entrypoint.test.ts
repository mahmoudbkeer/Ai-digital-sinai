import { describe, expect, it, vi } from "vitest";

vi.stubEnv("RUNTIME_MODE", "vercel");
vi.stubEnv("NODE_ENV", "test");

const module = await import("../server");

describe("Vercel Express entrypoint", () => {
  it("exports a valid Express application without starting a listener", () => {
    expect(typeof module.default).toBe("function");
    const app = module.default as typeof module.default & {
      router?: { stack?: Array<{ route?: { path?: string } }> };
    };
    const paths = (app.router?.stack ?? [])
      .map(layer => layer.route?.path)
      .filter((path): path is string => Boolean(path));

    expect(paths).toContain("/api/health");
    expect(paths).toContain("/api/readiness");
    expect(paths).toContain("/api/payments/webhook");
    expect(app.router?.stack?.some(layer => layer.name === "router")).toBe(true);
    expect(process._getActiveHandles().some(handle => handle.constructor.name === "Server")).toBe(false);
  });
});
