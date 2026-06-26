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
    maxLeavePerDay: null,
    headcount: 5,
    startISO: "2026-08-18", // Tuesday
    endISO: "2026-08-18",
    mode: "DAY",
    cal: uae,
    absentByDay: {},
    ...over,
  };
}

// ── assessCoverage — minStaffing only (story 28.1) ───────────────────────────

describe("assessCoverage — both null (skip-all)", () => {
  it("returns empty result, no warnings", () => {
    const r = assessCoverage(cov({ minStaffing: null, maxLeavePerDay: null }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe("assessCoverage — minStaffing only", () => {
  // headcount=5, minStaffing=3, requester absent → present = 5 - 0 - 1 = 4 ≥ 3 → no breach
  it("present == minStaffing+1 → no breach", () => {
    const r = assessCoverage(cov({ headcount: 5, minStaffing: 3, absentByDay: {} }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  // headcount=4, minStaffing=3 → present = 4 - 0 - 1 = 3 == minStaffing → no breach
  it("present == minStaffing (boundary) → no breach", () => {
    const r = assessCoverage(cov({ headcount: 4, minStaffing: 3, absentByDay: {} }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  // headcount=3, minStaffing=3 → present = 3 - 0 - 1 = 2 < 3 → breach
  it("present == minStaffing-1 → breach on that day", () => {
    const r = assessCoverage(cov({ headcount: 3, minStaffing: 3, absentByDay: {} }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("minimum staffing (3)");
    expect(r.warnings[0]).toContain("1 day(s)");
  });
});

describe("assessCoverage — absentByDay reduces present", () => {
  // headcount=5, 1 other already absent, minStaffing=3 → present = 5-1-1=3 → no breach
  it("other absent reduces present; still at boundary → no breach", () => {
    const r = assessCoverage(cov({ headcount: 5, minStaffing: 3, absentByDay: { "2026-08-18": 1 } }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  // headcount=5, 2 others absent, minStaffing=3 → present = 5-2-1=2 < 3 → breach
  it("two others absent drops below minimum → breach", () => {
    const r = assessCoverage(cov({ headcount: 5, minStaffing: 3, absentByDay: { "2026-08-18": 2 } }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warnings).toHaveLength(1);
  });

  // days with no entry default to 0 absent
  it("day not in absentByDay defaults to 0 absent", () => {
    // headcount=4, minStaffing=3 → present = 4-0-1 = 3 → no breach
    const r = assessCoverage(cov({ headcount: 4, minStaffing: 3, absentByDay: { "2026-08-19": 5 } }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
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
    expect(r.warnings[0]).toContain("3 day(s)");
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
    expect(r.warnings[0]).toContain("2 day(s)");
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
    expect(r.warnings).toEqual([]);
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
    expect(r.warnings).toHaveLength(1);
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
    expect(r.warnings).toEqual([]);
  });
});

describe("assessCoverage — tiny department edge case", () => {
  it("headcount=1, minStaffing=1 → any booking breaches", () => {
    const r = assessCoverage(cov({ headcount: 1, minStaffing: 1, absentByDay: {} }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    // present = 1-0-1 = 0 < 1
  });
});

describe("assessCoverage — minStaffing warning message format", () => {
  it("names the minimum and day count in the warning", () => {
    const r = assessCoverage(cov({ headcount: 3, minStaffing: 3 }));
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toBe(
      "This booking drops the department below its minimum staffing (3) on 1 day(s).",
    );
  });
});

// ── assessCoverage — maxLeavePerDay only (story 28.2) ────────────────────────

describe("assessCoverage — maxLeavePerDay only", () => {
  it("both null → no breach, no warnings", () => {
    const r = assessCoverage(cov({ minStaffing: null, maxLeavePerDay: null }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  // totalOff = 0 + 1 = 1 == maxLeavePerDay=1 → no breach (≤ is OK)
  it("total off == maxLeavePerDay (boundary) → no breach", () => {
    const r = assessCoverage(cov({ minStaffing: null, maxLeavePerDay: 1, headcount: 5, absentByDay: {} }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  // totalOff = 1 + 1 = 2 > maxLeavePerDay=1 → breach
  it("total off == max+1 → breach", () => {
    const r = assessCoverage(cov({ minStaffing: null, maxLeavePerDay: 1, headcount: 5, absentByDay: { "2026-08-18": 1 } }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("maximum of 1 people off");
    expect(r.warnings[0]).toContain("1 day(s)");
  });

  // totalOff = 0 + 1 = 1 ≤ maxLeavePerDay=2 → no breach
  it("no other absentees, max=2 → no breach", () => {
    const r = assessCoverage(cov({ minStaffing: null, maxLeavePerDay: 2, headcount: 5, absentByDay: {} }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  // totalOff = 2 + 1 = 3 > maxLeavePerDay=2 → breach
  it("two other absentees, max=2 → breach", () => {
    const r = assessCoverage(cov({ minStaffing: null, maxLeavePerDay: 2, headcount: 5, absentByDay: { "2026-08-18": 2 } }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warnings).toHaveLength(1);
  });

  it("maxLeavePerDay warning message format", () => {
    const r = assessCoverage(cov({ minStaffing: null, maxLeavePerDay: 2, headcount: 5, absentByDay: { "2026-08-18": 2 } }));
    expect(r.warnings[0]).toBe(
      "This booking exceeds the department's maximum of 2 people off on 1 day(s).",
    );
  });

  // half-day: occupies exactly startISO, totalOff = 0+1=1 > max=0 not realistic, use max=1 no breach
  it("half-day max check: totalOff == max → no breach", () => {
    const r = assessCoverage(cov({ minStaffing: null, maxLeavePerDay: 1, headcount: 5, mode: "HALF", absentByDay: {} }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("half-day max breach when 1 other absent and max=1", () => {
    const r = assessCoverage(cov({
      minStaffing: null, maxLeavePerDay: 1, headcount: 5, mode: "HALF",
      absentByDay: { "2026-08-18": 1 },
    }));
    // totalOff = 1+1=2 > 1 → breach
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warnings).toHaveLength(1);
  });

  // Weekend/holiday skipped for max rule too.
  it("max rule: weekend days skipped", () => {
    const r = assessCoverage(cov({
      minStaffing: null,
      maxLeavePerDay: 1,
      headcount: 5,
      startISO: "2026-08-15", // Saturday
      endISO: "2026-08-16",   // Sunday
      mode: "MULTI",
      absentByDay: { "2026-08-15": 5, "2026-08-16": 5 },
    }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

// ── assessCoverage — both rules simultaneously (story 28.2) ──────────────────

describe("assessCoverage — both rules set", () => {
  // headcount=5, minStaffing=3, maxLeavePerDay=2
  // 2026-08-18: 0 others absent → present=4 ≥ 3 (OK), totalOff=1 ≤ 2 (OK) → NEITHER
  it("neither rule breached → no warnings, no breachedDays", () => {
    const r = assessCoverage(cov({ minStaffing: 3, maxLeavePerDay: 2, headcount: 5, absentByDay: {} }));
    expect(r.breachedDays).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  // 2026-08-18: 2 others absent → present=5-2-1=2 < 3 (min breach), totalOff=2+1=3 > 2 (max breach)
  // → both rules breached → two warnings, day in breachedDays once
  it("both rules breached on same day → two warnings + day listed once", () => {
    const r = assessCoverage(cov({
      minStaffing: 3,
      maxLeavePerDay: 2,
      headcount: 5,
      absentByDay: { "2026-08-18": 2 },
    }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toContain("minimum staffing");
    expect(r.warnings[1]).toContain("maximum of 2 people off");
  });

  // Use multi-day to get different days breaching different rules:
  // Mon 2026-08-17: 2 absent → present=5-2-1=2 < 3 (min breach), totalOff=3 > 2 (max breach) → BOTH
  // Tue 2026-08-18: 1 absent → present=5-1-1=3 ≥ 3 (OK), totalOff=2 ≤ 2 (OK) → NEITHER
  // Wed 2026-08-19: 0 absent → present=5-0-1=4 ≥ 3 (OK), totalOff=1 ≤ 2 (OK) → NEITHER
  it("multi-day: only Monday breaches both rules", () => {
    const r = assessCoverage(cov({
      minStaffing: 3,
      maxLeavePerDay: 2,
      headcount: 5,
      startISO: "2026-08-17",
      endISO: "2026-08-19",
      mode: "MULTI",
      absentByDay: { "2026-08-17": 2 },
    }));
    expect(r.breachedDays).toEqual(["2026-08-17"]);
    expect(r.warnings).toHaveLength(2);
  });

  // Day breaches ONLY min: headcount=3, minStaffing=3, maxLeavePerDay=5
  // 0 others absent → present=3-0-1=2 < 3 (min breach), totalOff=1 ≤ 5 (OK) → ONLY min
  it("only minStaffing breached → one warning (min)", () => {
    const r = assessCoverage(cov({ minStaffing: 3, maxLeavePerDay: 5, headcount: 3, absentByDay: {} }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("minimum staffing");
  });

  // Day breaches ONLY max: headcount=10, minStaffing=3, maxLeavePerDay=1
  // 1 other absent → present=10-1-1=8 ≥ 3 (OK), totalOff=1+1=2 > 1 (max breach) → ONLY max
  it("only maxLeavePerDay breached → one warning (max)", () => {
    const r = assessCoverage(cov({
      minStaffing: 3,
      maxLeavePerDay: 1,
      headcount: 10,
      absentByDay: { "2026-08-18": 1 },
    }));
    expect(r.breachedDays).toEqual(["2026-08-18"]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("maximum of 1 people off");
  });

  // Multi-day: day A breaches only min, day B breaches only max — union in breachedDays
  // Mon 2026-08-17: 2 absent → present=5-2-1=2 < 3 (min breach), totalOff=3 ≤ 4 (OK) → ONLY min
  // Tue 2026-08-18: 4 absent → present=5-4-1=0 < 3 (min breach too), totalOff=5 > 4 (max breach) → BOTH
  // → use different headcount to isolate: headcount=10, minStaffing=3, maxLeavePerDay=2
  // Mon: 0 absent → present=10-0-1=9 ≥ 3 (OK), totalOff=1 ≤ 2 (OK) → NEITHER
  // Tue: 2 absent → present=10-2-1=7 ≥ 3 (OK), totalOff=3 > 2 (max breach) → ONLY max
  // Wed: 9 absent → present=10-9-1=0 < 3 (min breach), totalOff=10 > 2 (max breach too)
  // Let's pick a cleaner scenario: headcount=5, minStaffing=3, maxLeavePerDay=3
  // Mon 2026-08-17: 1 absent → present=5-1-1=3 ≥ 3 (OK), totalOff=2 ≤ 3 (OK) → NEITHER
  // Tue 2026-08-18: 2 absent → present=5-2-1=2 < 3 (min), totalOff=3 ≤ 3 (OK) → ONLY min
  // Wed 2026-08-19: 3 absent → present=5-3-1=1 < 3 (min), totalOff=4 > 3 (max) → BOTH
  it("multi-day: union of min-only + max-only days in breachedDays, two warnings each naming correct count", () => {
    const r = assessCoverage(cov({
      minStaffing: 3,
      maxLeavePerDay: 3,
      headcount: 5,
      startISO: "2026-08-17",
      endISO: "2026-08-19",
      mode: "MULTI",
      absentByDay: { "2026-08-17": 1, "2026-08-18": 2, "2026-08-19": 3 },
    }));
    // Mon: neither breached (excluded from breachedDays)
    // Tue: only min breached (present=2 < 3; totalOff=3 ≤ 3)
    // Wed: both breached (present=1 < 3; totalOff=4 > 3)
    expect(r.breachedDays).toEqual(["2026-08-18", "2026-08-19"]);
    expect(r.warnings).toHaveLength(2);
    // min breached on Tue + Wed = 2 days
    expect(r.warnings[0]).toContain("minimum staffing (3) on 2 day(s)");
    // max breached on Wed only = 1 day
    expect(r.warnings[1]).toContain("maximum of 3 people off on 1 day(s)");
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

  it("minStaffing breach adds a warning but keeps ok:true (no real errors)", () => {
    const r = validateLeaveRequest({
      ...leaveBase,
      coverage: {
        minStaffing: 3,
        maxLeavePerDay: null,
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
        maxLeavePerDay: null,
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
        maxLeavePerDay: null,
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
        maxLeavePerDay: null,
        headcount: 1,
        absentByDay: {},
      },
    });
    expect(r.warnings).toEqual([]);
  });
});

describe("validateLeaveRequest — coverage warnings (story 28.2)", () => {
  it("maxLeavePerDay breach surfaces as warning, ok stays true", () => {
    const r = validateLeaveRequest({
      ...leaveBase,
      coverage: {
        minStaffing: null,
        maxLeavePerDay: 1,
        headcount: 5,
        absentByDay: { "2026-08-18": 1 }, // totalOff=2 > 1 → breach
      },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("maximum of 1 people off");
  });

  it("both rules breached → two warnings, ok still true", () => {
    const r = validateLeaveRequest({
      ...leaveBase,
      coverage: {
        minStaffing: 3,
        maxLeavePerDay: 1,
        headcount: 3, // present=2 < 3 + totalOff=2 > 1
        absentByDay: { "2026-08-18": 1 },
      },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toContain("minimum staffing");
    expect(r.warnings[1]).toContain("maximum of 1 people off");
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

  it("minStaffing breach returns warning but ok:true and nextStatus:APPROVED", () => {
    const r = decideLeave(
      approveBase({
        coverage: {
          minStaffing: 3,
          maxLeavePerDay: null,
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
          maxLeavePerDay: null,
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
          maxLeavePerDay: null,
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

describe("decideLeave — coverage warnings (story 28.2)", () => {
  it("maxLeavePerDay breach surfaces as warning on approval, ok:true", () => {
    const r = decideLeave(
      approveBase({
        coverage: {
          minStaffing: null,
          maxLeavePerDay: 1,
          headcount: 5,
          startISO: "2026-08-18",
          endISO: "2026-08-18",
          mode: "DAY",
          cal: uae,
          absentByDay: { "2026-08-18": 1 }, // totalOff=2 > 1
        },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.nextStatus).toBe("APPROVED");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("maximum of 1 people off");
  });

  it("both rules breached on approval → two warnings, still approved", () => {
    const r = decideLeave(
      approveBase({
        coverage: {
          minStaffing: 3,
          maxLeavePerDay: 1,
          headcount: 3,
          startISO: "2026-08-18",
          endISO: "2026-08-18",
          mode: "DAY",
          cal: uae,
          absentByDay: { "2026-08-18": 1 }, // present=1 < 3 (min), totalOff=2 > 1 (max)
        },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.nextStatus).toBe("APPROVED");
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toContain("minimum staffing");
    expect(r.warnings[1]).toContain("maximum of 1 people off");
  });
});
