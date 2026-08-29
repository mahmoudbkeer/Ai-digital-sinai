import { describe, expect, it, beforeEach } from "vitest";

import { consumeAssistantQuota, resetAssistantQuotaForTests, assistantQuota } from "./assistantSafety";
import { canReadTenantData, canWriteTenantData, getTenantPermissions, hasTenantPermission } from "./tenantAccess";
import { BILLING_PERIOD_DAYS, getServerTrialDuration } from "./subscriptionPolicy";

describe("tenant access policy", () => {
  it("allows active members to read and prevents viewers from writing", () => {
    expect(canReadTenantData({ role: "viewer", status: "active" })).toBe(true);
    expect(canWriteTenantData({ role: "viewer", status: "active" })).toBe(false);
    expect(canWriteTenantData({ role: "manager", status: "active" })).toBe(true);
  });

  it("denies suspended or missing memberships", () => {
    expect(canReadTenantData({ role: "admin", status: "suspended" })).toBe(false);
    expect(canWriteTenantData(undefined)).toBe(false);
  });

  it("enforces the explicit permission matrix", () => {
    const viewer = { role: "viewer" as const, status: "active" as const };
    expect(hasTenantPermission(viewer, "orders.read")).toBe(true);
    expect(hasTenantPermission(viewer, "orders.manage")).toBe(false);
    expect(getTenantPermissions("manager")).toContain("services.manage");
  });
});

describe("subscription policy", () => {
  it("accepts only plan-controlled trial durations", () => {
    expect(getServerTrialDuration(90)).toBe(90);
    expect(() => getServerTrialDuration(91)).toThrow();
    expect(() => getServerTrialDuration(-1)).toThrow();
    expect(BILLING_PERIOD_DAYS).toBe(30);
  });
});

describe("assistant quota", () => {
  beforeEach(() => resetAssistantQuotaForTests());

  it("allows the configured number of messages and then blocks the next one", () => {
    let result = consumeAssistantQuota("test-session", 10_000);
    for (let index = 1; index < assistantQuota.maxMessages; index += 1) {
      result = consumeAssistantQuota("test-session", 10_000 + index);
    }
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
    expect(consumeAssistantQuota("test-session", 10_000 + assistantQuota.maxMessages).allowed).toBe(false);
  });

  it("opens a new window after the configured interval", () => {
    for (let index = 0; index < assistantQuota.maxMessages; index += 1) consumeAssistantQuota("window-session", 2_000 + index);
    expect(consumeAssistantQuota("window-session", 2_000 + assistantQuota.windowMs).allowed).toBe(true);
  });
});
