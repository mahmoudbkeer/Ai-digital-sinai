import { describe, expect, it } from "vitest";

import { getServiceById, getStatusLabel, services } from "./demo-data";

describe("AI DIGITAL SINAI mobile data", () => {
  it("returns a stable service for a valid id and a safe fallback for an unknown id", () => {
    expect(getServiceById("svc-2").name).toBe("ضيافة محلية للمناسبات");
    expect(getServiceById("missing").id).toBe(services[0].id);
  });

  it("keeps request status labels in Arabic", () => {
    expect(getStatusLabel("new")).toBe("جديد");
    expect(getStatusLabel("in_progress")).toBe("قيد التنفيذ");
    expect(getStatusLabel("completed")).toBe("مكتمل");
  });
});
