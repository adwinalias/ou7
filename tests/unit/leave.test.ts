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

// ── Minimum length & max consecutive days (story 26.4) ────────────────────
// 2026-08-18 = Tuesday (UAE: weekendDays [6,0] = Fri+Sat... wait, UAEcal uses
// weekendDays:[6,0] = Sat(6)+Sun(0). So Mon–Thu+Fri are working days in UAE.
// Use 2026-08-18 (Tuesday) as single day; 2026-08-17 (Monday) as adjacent day.
describe("min length & max consecutive days (story 26.4)", () => {
  const lb = { ...base, available: 20 };

  // ── minLengthDays ──────────────────────────────────────────────────────────
  it("minLengthDays: workingDays == min (boundary) → allowed", () => {
    const r = validateLeaveRequest({ ...lb, minLengthDays: 1 });
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.includes("requires at least"))).toBe(false);
  });

  it("minLengthDays: workingDays == min-1 (below min) → blocked", () => {
    // HALF day = 0.5 working days, min = 1 → fails
    const r = validateLeaveRequest({ ...lb, mode: "HALF", minLengthDays: 1 });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("requires at least 1 working day(s)");
  });

  it("minLengthDays: HALF request (0.5 wd) vs minLengthDays:1 → blocked", () => {
    const r = validateLeaveRequest({ ...lb, mode: "HALF", minLengthDays: 1 });
    expect(r.errors.join()).toContain("requires at least 1 working day(s)");
  });

  it("minLengthDays: HALF request vs no min → allowed", () => {
    const r = validateLeaveRequest({ ...lb, mode: "HALF" });
    expect(r.errors.some((e) => e.includes("requires at least"))).toBe(false);
  });

  it("minLengthDays: 2 working days satisfies min:2 → allowed", () => {
    // 2026-08-18 (Tue) + 2026-08-19 (Wed) = 2 working days
    const r = validateLeaveRequest({ ...lb, endISO: "2026-08-19", mode: "MULTI", minLengthDays: 2 });
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.includes("requires at least"))).toBe(false);
  });

  it("minLengthDays: 1 working day vs min:2 → blocked", () => {
    const r = validateLeaveRequest({ ...lb, minLengthDays: 2 });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("requires at least 2 working day(s)");
  });

  // ── maxConsecutiveDays ─────────────────────────────────────────────────────
  it("maxConsecutiveDays: workingDays == max (boundary) → allowed", () => {
    const r = validateLeaveRequest({ ...lb, maxConsecutiveDays: 1 });
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.includes("allows at most"))).toBe(false);
  });

  it("maxConsecutiveDays: workingDays == max+1 → blocked", () => {
    // 2 working days vs max:1
    const r = validateLeaveRequest({ ...lb, endISO: "2026-08-19", mode: "MULTI", maxConsecutiveDays: 1 });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("allows at most 1 consecutive working day(s)");
  });

  it("maxConsecutiveDays: HALF request (0.5 wd) vs max:1 → allowed", () => {
    const r = validateLeaveRequest({ ...lb, mode: "HALF", maxConsecutiveDays: 1 });
    expect(r.errors.some((e) => e.includes("allows at most"))).toBe(false);
  });

  // ── both set together ──────────────────────────────────────────────────────
  it("both set: 2 wd satisfies min:2 and max:5 → allowed", () => {
    const r = validateLeaveRequest({
      ...lb,
      endISO: "2026-08-19",
      mode: "MULTI",
      minLengthDays: 2,
      maxConsecutiveDays: 5,
    });
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.includes("requires at least") || e.includes("allows at most"))).toBe(false);
  });

  it("both set: 1 wd violates min:2 → blocked with min error", () => {
    const r = validateLeaveRequest({ ...lb, minLengthDays: 2, maxConsecutiveDays: 5 });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("requires at least 2 working day(s)");
  });

  it("both set: 3 wd violates max:2 → blocked with max error", () => {
    // 2026-08-18 (Tue) → 2026-08-20 (Thu) = 3 working days
    const r = validateLeaveRequest({
      ...lb,
      endISO: "2026-08-20",
      mode: "MULTI",
      minLengthDays: 1,
      maxConsecutiveDays: 2,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("allows at most 2 consecutive working day(s)");
  });

  // ── absent / zero fields → no length errors (back-compat) ────────────────
  it("absent minLengthDays → no min error", () => {
    const r = validateLeaveRequest({ ...lb });
    expect(r.errors.some((e) => e.includes("requires at least"))).toBe(false);
  });

  it("absent maxConsecutiveDays → no max error", () => {
    const r = validateLeaveRequest({ ...lb, endISO: "2026-08-25", mode: "MULTI" });
    expect(r.errors.some((e) => e.includes("allows at most"))).toBe(false);
  });

  it("minLengthDays:0 → treated as absent (no error)", () => {
    const r = validateLeaveRequest({ ...lb, mode: "HALF", minLengthDays: 0 });
    expect(r.errors.some((e) => e.includes("requires at least"))).toBe(false);
  });

  it("maxConsecutiveDays:0 → treated as absent (no error)", () => {
    const r = validateLeaveRequest({ ...lb, endISO: "2026-08-25", mode: "MULTI", maxConsecutiveDays: 0 });
    expect(r.errors.some((e) => e.includes("allows at most"))).toBe(false);
  });

  // ── all-weekend request: workingDays=0 → reports non-working first, skips min ──
  it("all-weekend request: reports non-working days error; no min-length error", () => {
    // 2026-08-22 = Saturday (UAE weekend), 2026-08-23 = Sunday → 0 working days
    const r = validateLeaveRequest({ ...lb, startISO: "2026-08-22", endISO: "2026-08-23", mode: "MULTI", minLengthDays: 1 });
    expect(r.errors.some((e) => e.includes("non-working"))).toBe(true);
    expect(r.errors.some((e) => e.includes("requires at least"))).toBe(false);
  });

  // ── working-day span vs calendar span ─────────────────────────────────────
  // Mon 2026-08-17 → Mon 2026-08-24: 8 calendar days spanning a Sat+Sun weekend.
  // UAE weekend = [6,0] (Sat+Sun), so working days = Mon+Tue+Wed+Thu+Fri + Mon = 6.
  it("weekends excluded: Mon–Mon range (8 calendar days) counts as 6 working days for limit", () => {
    // 2026-08-17 Mon → 2026-08-24 Mon = 8 calendar days, 6 working days (Sat 22 + Sun 23 excluded)
    const r = validateLeaveRequest({
      ...lb,
      startISO: "2026-08-17",
      endISO: "2026-08-24",
      mode: "MULTI",
      maxConsecutiveDays: 6,
    });
    expect(r.ok).toBe(true);
    expect(r.workingDays).toBe(6);
    expect(r.errors.some((e) => e.includes("allows at most"))).toBe(false);
  });

  it("weekends excluded: same range blocked at maxConsecutiveDays:5 (working days=6 > 5)", () => {
    const r = validateLeaveRequest({
      ...lb,
      startISO: "2026-08-17",
      endISO: "2026-08-24",
      mode: "MULTI",
      maxConsecutiveDays: 5,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("allows at most 5 consecutive working day(s)");
  });
});
