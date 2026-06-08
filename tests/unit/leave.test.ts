import { describe, it, expect } from "vitest";
import { validateLeaveRequest } from "@/core/leave";
import type { RegionCalendar } from "@/core/types";

const uae: RegionCalendar = { weekendDays: [6, 0], holidays: new Set() };
// 2026-08-18 is a Tuesday (working day).
const base = {
  startISO: "2026-08-18",
  endISO: "2026-08-18",
  mode: "DAY" as const,
  cal: uae,
  deductsAllowance: true,
  available: 5,
  existing: [],
};

describe("leave validation", () => {
  it("accepts a valid single working day within balance", () => {
    const r = validateLeaveRequest(base);
    expect(r.ok).toBe(true);
    expect(r.allowanceDays).toBe(1);
  });

  it("blocks overlap with existing leave", () => {
    const r = validateLeaveRequest({
      ...base,
      existing: [{ startISO: "2026-08-17", endISO: "2026-08-20" }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("already requested");
  });

  it("blocks over-booking", () => {
    const r = validateLeaveRequest({ ...base, available: 0 });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("exceeds your available balance");
  });

  it("requires a supporting document for sick leave over 2 days", () => {
    const r = validateLeaveRequest({
      ...base,
      endISO: "2026-08-21",
      mode: "MULTI",
      deductsAllowance: false,
      available: 99,
      attachmentRequired: true,
      attachmentThresholdDays: 2,
      hasAttachment: false,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("supporting document");
  });
});
