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

  it("blocks leave overlapping a restricted/blackout period, naming the reason (Epic 10.2)", () => {
    const r = validateLeaveRequest({
      ...base,
      restricted: [{ startISO: "2026-08-17", endISO: "2026-08-19", reason: "Year-end freeze" }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("restricted period: Year-end freeze");
  });

  it("allows leave that does not touch any restricted period", () => {
    const r = validateLeaveRequest({
      ...base,
      restricted: [{ startISO: "2026-12-01", endISO: "2026-12-05", reason: "Audit week" }],
    });
    expect(r.ok).toBe(true);
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

// ── Notice period (story 26.2) ─────────────────────────────────────────────
// "today" is 2026-08-10 (Monday, working day, no holidays) throughout unless stated.
describe("notice period check (story 26.2)", () => {
  // Shared base: a future working day, plenty of balance, no other constraints.
  const nb = {
    ...base,
    available: 20,
    todayISO: "2026-08-10" as const,
  };

  // ── positive N = 3 ────────────────────────────────────────────────────────
  it("positive N: start = today+N (earliest allowed) → ok", () => {
    const r = validateLeaveRequest({ ...nb, startISO: "2026-08-13", endISO: "2026-08-13", noticePeriodDays: 3 });
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.includes("notice"))).toBe(false);
  });

  it("positive N: start = today+N-1 (one day too early) → blocked", () => {
    const r = validateLeaveRequest({ ...nb, startISO: "2026-08-12", endISO: "2026-08-12", noticePeriodDays: 3 });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("3 day(s) notice");
  });

  it("positive N: start far in future → ok", () => {
    const r = validateLeaveRequest({ ...nb, startISO: "2026-09-01", endISO: "2026-09-01", noticePeriodDays: 3 });
    expect(r.ok).toBe(true);
  });

  // ── N = 0 (same-day booking) ──────────────────────────────────────────────
  it("N=0: start = today → ok", () => {
    const r = validateLeaveRequest({ ...nb, startISO: "2026-08-10", endISO: "2026-08-10", noticePeriodDays: 0 });
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.includes("notice"))).toBe(false);
  });

  it("N=0: start = yesterday → blocked", () => {
    const r = validateLeaveRequest({ ...nb, startISO: "2026-08-09", endISO: "2026-08-09", noticePeriodDays: 0 });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("0 day(s) notice");
  });

  it("N=0: start = tomorrow → ok", () => {
    const r = validateLeaveRequest({ ...nb, startISO: "2026-08-11", endISO: "2026-08-11", noticePeriodDays: 0 });
    expect(r.ok).toBe(true);
  });

  // ── negative N = -3 (allow up to 3 days in the past) ─────────────────────
  it("negative N: start = today-3 (earliest allowed) → ok", () => {
    const r = validateLeaveRequest({ ...nb, startISO: "2026-08-07", endISO: "2026-08-07", noticePeriodDays: -3 });
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.includes("past"))).toBe(false);
  });

  it("negative N: start = today-4 (one day too far back) → blocked", () => {
    const r = validateLeaveRequest({ ...nb, startISO: "2026-08-06", endISO: "2026-08-06", noticePeriodDays: -3 });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("3 day(s) in the past");
  });

  it("negative N: start = today → ok", () => {
    const r = validateLeaveRequest({ ...nb, startISO: "2026-08-10", endISO: "2026-08-10", noticePeriodDays: -3 });
    expect(r.ok).toBe(true);
  });

  // ── Weekend/holiday independence ──────────────────────────────────────────
  // Today = Friday 2026-08-07 (UAE weekend = Sat+Sun, so tomorrow is a weekend).
  // Notice N=2: earliest = 2026-08-09 (Sunday, still a weekend in UAE). Calendar days only.
  it("boundary is calendar-day based: today=Friday, N=2, start=Sunday (weekend) → ok", () => {
    const r = validateLeaveRequest({
      ...nb,
      todayISO: "2026-08-07",
      startISO: "2026-08-09", // Sunday — UAE weekend
      endISO: "2026-08-09",
      noticePeriodDays: 2,
    });
    // Sunday is not a working day so workingDays=0 triggers its own error,
    // but there must be NO notice error — the boundary is met.
    expect(r.errors.every((e) => !e.includes("notice"))).toBe(true);
  });

  it("boundary is calendar-day based: today=Friday, N=2, start=Saturday → blocked by notice (not working-day math)", () => {
    const r = validateLeaveRequest({
      ...nb,
      todayISO: "2026-08-07",
      startISO: "2026-08-08", // Saturday, only 1 calendar day ahead — fails notice
      endISO: "2026-08-08",
      noticePeriodDays: 2,
    });
    expect(r.errors.join()).toContain("2 day(s) notice");
  });

  // Today = holiday: 2026-12-02 (UAE National Day). N=1 → earliest = 2026-12-03.
  it("boundary is calendar-day based: today=holiday, N=1, start=tomorrow → ok", () => {
    const uaeWithHoliday: RegionCalendar = {
      weekendDays: [6, 0],
      holidays: new Set(["2026-12-02"]),
    };
    const r = validateLeaveRequest({
      ...nb,
      cal: uaeWithHoliday,
      todayISO: "2026-12-02",
      startISO: "2026-12-03",
      endISO: "2026-12-03",
      noticePeriodDays: 1,
    });
    expect(r.errors.every((e) => !e.includes("notice"))).toBe(true);
  });

  it("boundary is calendar-day based: today=holiday, N=1, start=same day → blocked", () => {
    const uaeWithHoliday: RegionCalendar = {
      weekendDays: [6, 0],
      holidays: new Set(["2026-12-02"]),
    };
    const r = validateLeaveRequest({
      ...nb,
      cal: uaeWithHoliday,
      todayISO: "2026-12-02",
      startISO: "2026-12-02",
      endISO: "2026-12-02",
      noticePeriodDays: 1,
    });
    expect(r.errors.join()).toContain("1 day(s) notice");
  });

  // ── Back-compat: missing params → no notice error ─────────────────────────
  it("omitting todayISO entirely → no notice error (back-compat)", () => {
    const { todayISO: _t, ...noToday } = nb;
    const r = validateLeaveRequest({ ...noToday, startISO: "2026-07-01", endISO: "2026-07-01", noticePeriodDays: 30 });
    expect(r.errors.every((e) => !e.includes("notice"))).toBe(true);
  });

  it("omitting noticePeriodDays entirely → no notice error (back-compat)", () => {
    const r = validateLeaveRequest({ ...nb, startISO: "2026-07-01", endISO: "2026-07-01" });
    expect(r.errors.every((e) => !e.includes("notice"))).toBe(true);
  });

  it("omitting both todayISO and noticePeriodDays → no notice error (back-compat)", () => {
    const { todayISO: _t, ...noToday } = nb;
    const r = validateLeaveRequest({ ...noToday, startISO: "2026-07-01", endISO: "2026-07-01" });
    expect(r.errors.every((e) => !e.includes("notice"))).toBe(true);
  });
});
