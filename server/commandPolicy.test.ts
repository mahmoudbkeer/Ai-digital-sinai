import { describe, expect, it } from "vitest";
import { isValidCommand } from "./commandPolicy";

describe("command policy", () => {
  it("accepts a known sector/module/operation tuple", () => {
    expect(isValidCommand({ sectorId: "retail", moduleId: "retail-catalog", operationId: "retail-publish" })).toBe(true);
  });

  it("rejects cross-tenant-like or cross-sector identifiers", () => {
    expect(isValidCommand({ sectorId: "retail", moduleId: "food-catalog", operationId: "retail-publish" })).toBe(false);
    expect(isValidCommand({ sectorId: "unknown", moduleId: "unknown-catalog", operationId: "unknown-publish" })).toBe(false);
  });

  it("rejects arbitrary values and prototype-shaped input", () => {
    expect(isValidCommand({ sectorId: "retail", moduleId: "retail-catalog", operationId: "retail-delete-all" })).toBe(false);
    expect(isValidCommand({ sectorId: "__proto__", moduleId: "__proto__-catalog", operationId: "__proto__-publish" })).toBe(false);
    expect(isValidCommand({ sectorId: 1, moduleId: "retail-catalog", operationId: "retail-publish" })).toBe(false);
  });
});
