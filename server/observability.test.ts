import { afterEach, describe, expect, it, vi } from "vitest";
import { createSafeErrorLog, emitStructuredEvent } from "./observability";

describe("structured observability", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits JSON events with stable sensitive-event fields", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    emitStructuredEvent({ event: "payment.capture", requestId: "req-1", tenantId: "tenant-1", actorUserId: "user-1", resourceType: "payment_intent", resourceId: "pay-1", metadata: { status: "CAPTURED" } });
    const line = String(write.mock.calls[0]?.[0] ?? "");
    expect(JSON.parse(line)).toMatchObject({ event: "payment.capture", requestId: "req-1", tenantId: "tenant-1", actorUserId: "user-1", resourceType: "payment_intent", resourceId: "pay-1", metadata: { status: "CAPTURED" } });
  });

  it("bounds error content", () => {
    const log = createSafeErrorLog({ requestId: "req-2", method: "POST", path: "/api/auth", status: 401, error: "x".repeat(500) });
    expect(log.event).toBe("http_error");
    expect(log.error).toHaveLength(200);
  });
});
