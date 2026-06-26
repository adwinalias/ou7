import { describe, it, expect } from "vitest";
import { assessCoverage, validateLeaveRequest, type CoverageInput } from "@/core/leave";
import { decideLeave } from "@/core/approvals";
import type { RegionCalendar } from "@/core/types";

// UAE calendar: Sat(6)+Sun(0) weekend, no holidays by default.
const uae: RegionCalendar = { weekendDays: [6, 0], holidays: new Set() };

// Helper: minimal CoverageInput for a single working-day DAY request.
function cov(over: Partial<CoverageInput> = {}): CoverageInput {
  return {
    minStaffing: 3,
    headcount: 5,
    startISO: "2026-08-18", // Tuesday
    endISO: "2026-08-18",
    mode: "DAY",
    cal: uae,
    absentByDay: {},
    ...over,
  };
}

// ── assessCoverage ────────────────────────────────────────────────────────────

describe("assessCoverage — minStaffing null", () => {
  it("returns empty result, no warning", () => {
    const r = assessCoverage(cov({ minStaffing: null }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warning).toBeNull();
  });
});

describe("assessCoverage — single working day", () => {
  // headcount=5, minStaffing=3, requester absent → present = 5 - 0 - 1 = 4 ≥ 3 → no breach
  it("present == minStaffing+1 → no breach", () => {
    const r = assessCoverage(cov({ headcount: 5, minStaffing: 3, absentByDay: {} }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warning).toBeNull();
  });

  // headcount=4, minStaffing=3 → present = 4 - 0 - 1 = 3 == minStaffing → no breach
  it("present == minStaffing (boundary) → no breach", () => {
    const r = assessCoverage(cov({ headcount: 4, minStaffing: 3, absentByDay: {} }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warning).toBeNull();
  });

  // headcount=3, minStaffing=3 → present = 3 - 0 - 1 = 2 < 3 → breach
  it("present == minStaffing-1 → breach on that day", () => {
    const r = assessCoverage(cov({ headcount: 3, minStaffing: 3, absentByDay: {} }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warning).toContain("minimum staffing (3)");
    expect(r.warning).toContain("1 day(s)");
  });
});

describe("assessCoverage — absentByDay reduces present", () => {
  // headcount=5, 1 other already absent, minStaffing=3 → present = 5-1-1=3 → no breach
  it("other absent reduces present; still at boundary → no breach", () => {
    const r = assessCoverage(cov({ headcount: 5, minStaffing: 3, absentByDay: { "2026-08-18": 1 } }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warning).toBeNull();
  });

  // headcount=5, 2 others absent, minStaffing=3 → present = 5-2-1=2 < 3 → breach
  it("two others absent drops below minimum → breach", () => {
    const r = assessCoverage(cov({ headcount: 5, minStaffing: 3, absentByDay: { "2026-08-18": 2 } }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warning).not.toBeNull();
  });

  // days with no entry default to 0 absent
  it("day not in absentByDay defaults to 0 absent", () => {
    // headcount=4, minStaffing=3 → present = 4-0-1 = 3 → no breach
    const r = assessCoverage(cov({ headcount: 4, minStaffing: 3, absentByDay: { "2026-08-19": 5 } }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warning).toBeNull();
  });
});

describe("assessCoverage — multi-day spanning weekend/holiday", () => {
  // Mon 2026-08-17 → Wed 2026-08-19 (MULTI): 3 working days (UAE weekend=Sat+Sun, none in range)
  // headcount=3, minStaffing=3, 0 others absent → present=2 < 3 on all 3 working days → 3 breaches
  it("all three working days breach, no skipped days", () => {
    const r = assessCoverage(
      cov({
        headcount: 3,
        minStaffing: 3,
        startISO: "2026-08-17",
        endISO: "2026-08-19",
        mode: "MULTI",
        absentByDay: {},
      }),
    );
    expect(r.breachedDays).toEqual(["2026-08-17", "2026-08-18", "2026-08-19"]);
    expect(r.warning).toContain("3 day(s)");
  });

  // Fri 2026-08-14 → Mon 2026-08-17 (MULTI): Sat(15)+Sun(16) are weekend → only Fri+Mon assessed
  // headcount=3, minStaffing=3 → present=2 on working days → 2 breaches (weekend days skipped)
  it("weekend days skipped; only Fri + Mon are working days", () => {
    const r = assessCoverage(
      cov({
        headcount: 3,
        minStaffing: 3,
        startISO: "2026-08-14",
        endISO: "2026-08-17",
        mode: "MULTI",
        absentByDay: {},
      }),
    );
    expect(r.breachedDays).toEqual(["2026-08-14", "2026-08-17"]);
    expect(r.breachedDays).not.toContain("2026-08-15"); // Saturday
    expect(r.breachedDays).not.toContain("2026-08-16"); // Sunday
    expect(r.warning).toContain("2 day(s)");
  });

  // Range includes a public holiday: headcount=3, minStaffing=3, Tue 2026-08-18 is holiday
  // Mon+Wed are working, Tue is skipped → 2 breaches
  it("holiday days skipped; only Mon + Wed assessed when Tue is holiday", () => {
    const calWithHoliday: RegionCalendar = { weekendDays: [6, 0], holidays: new Set(["2026-08-18"]) };
    const r = assessCoverage(
      cov({
        headcount: 3,
        minStaffing: 3,
        startISO: "2026-08-17",
        endISO: "2026-08-19",
        mode: "MULTI",
        cal: calWithHoliday,
        absentByDay: {},
      }),
    );
    expect(r.breachedDays).toEqual(["2026-08-17", "2026-08-19"]);
    expect(r.breachedDays).not.toContain("2026-08-18");
  });

  // Range is ALL weekend: no working days → no breaches
  it("all-weekend range → no breaches", () => {
    const r = assessCoverage(
      cov({
        headcount: 1,
        minStaffing: 99,
        startISO: "2026-08-15",
        endISO: "2026-08-16",
        mode: "MULTI",
        absentByDay: {},
      }),
    );
    expect(r.breachedDays).toEqual([]);
    expect(r.warning).toBeNull();
  });
});

describe("assessCoverage — half-day request", () => {
  // HALF mode: occupies exactly one day (startISO); present = headcount-absent-1
  it("half-day breach when present < minStaffing on that day", () => {
    const r = assessCoverage(
      cov({
        headcount: 3,
        minStaffing: 3,
        startISO: "2026-08-18",
        endISO: "2026-08-18", // ignored for HALF but kept consistent
        mode: "HALF",
        absentByDay: {},
      }),
    );
    // present = 3-0-1=2 < 3 → breach
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warning).not.toBeNull();
  });

  it("half-day no breach when present == minStaffing", () => {
    const r = assessCoverage(
      cov({
        headcount: 4,
        minStaffing: 3,
        startISO: "2026-08-18",
        mode: "HALF",
        absentByDay: {},
      }),
    );
    // present = 4-0-1=3 == 3 → no breach
    expect(r.breachedDays).toEqual([]);
    expect(r.warning).toBeNull();
  });
});

describe("assessCoverage — tiny department edge case", () => {
  it("headcount=1, minStaffing=1 → any booking breaches", () => {
    const r = assessCoverage(cov({ headcount: 1, minStaffing: 1, absentByDay: {} }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    // present = 1-0-1 = 0 < 1
  });
});

describe("assessCoverage — warning message format", () => {
  it("names the minimum and day count in the warning", () => {
    const r = assessCoverage(cov({ headcount: 3, minStaffing: 3 }));
    expect(r.warning).toBe(
      "This booking drops the department below its minimum staffing (3) on 1 day(s).",
    );
  });
});

// ── validateLeaveRequest — coverage warnings plumbing ────────────────────────

const leaveBase = {
  startISO: "2026-08-18" as const,
  endISO: "2026-08-18" as const,
  mode: "DAY" as const,
  cal: uae,
  deductsAllowance: true,
  available: 10,
  existing: [],
};

describe("validateLeaveRequest — coverage warnings (story 28.1)", () => {
  it("no coverage input → warnings:[] and ok unchanged", () => {
    const r = validateLeaveRequest(leaveBase);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("coverage breach adds a warning but keeps ok:true (no real errors)", () => {
    const r = validateLeaveRequest({
      ...leaveBase,
      coverage: {
        minStaffing: 3,
        headcount: 3, // present = 3-0-1=2 < 3 → breach
        absentByDay: {},
      },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("minimum staffing");
  });

  it("coverage no breach → warnings:[]", () => {
    const r = validateLeaveRequest({
      ...leaveBase,
      coverage: {
        minStaffing: 3,
        headcount: 5, // present = 5-0-1=4 ≥ 3 → no breach
        absentByDay: {},
      },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("coverage breach + real error: ok:false, both errors and warnings present", () => {
    const r = validateLeaveRequest({
      ...leaveBase,
      available: 0, // triggers over-booking error
      coverage: {
        minStaffing: 3,
        headcount: 3, // triggers coverage warning
        absentByDay: {},
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("exceeds your available balance");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("minimum staffing");
  });

  it("minStaffing null → no warning even with low headcount", () => {
    const r = validateLeaveRequest({
      ...leaveBase,
      coverage: {
        minStaffing: null,
        headcount: 1,
        absentByDay: {},
      },
    });
    expect(r.warnings).toEqual([]);
  });
});

// ── decideLeave — coverage warnings plumbing ─────────────────────────────────

function approveBase(over: Partial<Parameters<typeof decideLeave>[0]> = {}) {
  return {
    currentStatus: "PENDING" as const,
    action: "APPROVE" as const,
    deductsAllowance: true,
    allowanceDays: 1,
    remainingExclR: 10,
    otherPending: 0,
    ...over,
  };
}

describe("decideLeave — coverage warnings (story 28.1)", () => {
  it("no coverage → warnings:[]", () => {
    const r = decideLeave(approveBase());
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("coverage breach returns warning but ok:true and nextStatus:APPROVED", () => {
    const r = decideLeave(
      approveBase({
        coverage: {
          minStaffing: 3,
          headcount: 3,
          startISO: "2026-08-18",
          endISO: "2026-08-18",
          mode: "DAY",
          cal: uae,
          absentByDay: {},
        },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.nextStatus).toBe("APPROVED");
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("minimum staffing");
  });

  it("coverage no breach → ok:true, warnings:[]", () => {
    const r = decideLeave(
      approveBase({
        coverage: {
          minStaffing: 3,
          headcount: 5,
          startISO: "2026-08-18",
          endISO: "2026-08-18",
          mode: "DAY",
          cal: uae,
          absentByDay: {},
        },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("over-commit blocks (ok:false) regardless of coverage: warnings still empty on hard-block path", () => {
    const r = decideLeave(
      approveBase({
        allowanceDays: 20,
        remainingExclR: 5,
        otherPending: 0,
        coverage: {
          minStaffing: 3,
          headcount: 3,
          startISO: "2026-08-18",
          endISO: "2026-08-18",
          mode: "DAY",
          cal: uae,
          absentByDay: {},
        },
      }),
    );
    // over-commit short-circuits before coverage check
    expect(r.ok).toBe(false);
    expect(r.nextStatus).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it("decline path: warnings:[] always", () => {
    const r = decideLeave(approveBase({ action: "DECLINE", reason: "Too busy" }));
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});
