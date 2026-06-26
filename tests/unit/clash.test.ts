import { describe, it, expect } from "vitest";
import { assessClash, validateLeaveRequest, type ClashCounterpart, type ClashInput } from "@/core/leave";
import { decideLeave, OVER_COMMIT_MESSAGE } from "@/core/approvals";
import type { RegionCalendar } from "@/core/types";

// UAE calendar: Sat(6)+Sun(0) weekend, no holidays.
const uae: RegionCalendar = { weekendDays: [6, 0], holidays: new Set() };

// Mon 2026-08-17 → Fri 2026-08-21 are all working days (UAE).
// Sat 2026-08-15, Sun 2026-08-16 are weekend.

function clash(over: Partial<ClashInput> = {}): ClashInput {
  return {
    startISO: "2026-08-18", // Tuesday
    endISO: "2026-08-18",
    mode: "DAY",
    cal: uae,
    counterparts: [],
    ...over,
  };
}

function cp(name: string, start: string, end: string): ClashCounterpart {
  return { name, startISO: start, endISO: end };
}

// ── assessClash — no counterparts ────────────────────────────────────────────

describe("assessClash — empty counterparts", () => {
  it("returns no clash", () => {
    const r = assessClash(clash({ counterparts: [] }));
    expect(r.hasClash).toBe(false);
    expect(r.clashedNames).toEqual([]);
    expect(r.sharedDays).toEqual([]);
    expect(r.message).toBeNull();
  });
});

// ── assessClash — shared working day overlap ──────────────────────────────────

describe("assessClash — shared working day overlap → clash", () => {
  it("exact same day → clash", () => {
    const r = assessClash(clash({ counterparts: [cp("Alice", "2026-08-18", "2026-08-18")] }));
    expect(r.hasClash).toBe(true);
    expect(r.clashedNames).toEqual(["Alice"]);
    expect(r.sharedDays).toEqual(["2026-08-18"]);
    expect(r.message).toContain("Alice");
    expect(r.message).toContain("1 shared working day(s)");
  });

  it("request inside counterpart range → clash", () => {
    // Request: Tue–Wed; counterpart: Mon–Fri
    const r = assessClash(clash({
      startISO: "2026-08-18",
      endISO: "2026-08-19",
      mode: "MULTI",
      counterparts: [cp("Bob", "2026-08-17", "2026-08-21")],
    }));
    expect(r.hasClash).toBe(true);
    expect(r.sharedDays).toEqual(["2026-08-18", "2026-08-19"]);
  });

  it("partial overlap → only shared working days collected", () => {
    // Request: Mon–Wed; counterpart: Wed–Fri → shared = Wed only
    const r = assessClash(clash({
      startISO: "2026-08-17",
      endISO: "2026-08-19",
      mode: "MULTI",
      counterparts: [cp("Carol", "2026-08-19", "2026-08-21")],
    }));
    expect(r.hasClash).toBe(true);
    expect(r.sharedDays).toEqual(["2026-08-19"]);
  });
});

// ── assessClash — weekend/holiday overlap is NOT a clash ─────────────────────

describe("assessClash — overlap only on non-working days → no clash", () => {
  it("overlap falls entirely on Saturday+Sunday → no clash", () => {
    // Request: Sat–Sun 2026-08-15/16; counterpart: same weekend range
    const r = assessClash(clash({
      startISO: "2026-08-15",
      endISO: "2026-08-16",
      mode: "MULTI",
      counterparts: [cp("Dave", "2026-08-15", "2026-08-16")],
    }));
    expect(r.hasClash).toBe(false);
    expect(r.sharedDays).toEqual([]);
    expect(r.message).toBeNull();
  });

  it("overlap falls on a public holiday → no clash", () => {
    const calWithHol: RegionCalendar = { weekendDays: [6, 0], holidays: new Set(["2026-08-18"]) };
    // Request: Tue 2026-08-18 (holiday); counterpart covers same day
    const r = assessClash(clash({
      startISO: "2026-08-18",
      endISO: "2026-08-18",
      cal: calWithHol,
      counterparts: [cp("Eve", "2026-08-18", "2026-08-18")],
    }));
    expect(r.hasClash).toBe(false);
    expect(r.sharedDays).toEqual([]);
  });

  it("ranges touch only via weekend gap → no overlap at all → no clash", () => {
    // Request ends Fri 2026-08-14; counterpart starts Mon 2026-08-17 → no calendar overlap
    const r = assessClash(clash({
      startISO: "2026-08-13",
      endISO: "2026-08-14",
      mode: "MULTI",
      counterparts: [cp("Frank", "2026-08-17", "2026-08-19")],
    }));
    expect(r.hasClash).toBe(false);
  });
});

// ── assessClash — half-day request ────────────────────────────────────────────

describe("assessClash — half-day mode occupies exactly startISO", () => {
  it("HALF request on a day counterpart covers → clash", () => {
    const r = assessClash(clash({
      startISO: "2026-08-18",
      endISO: "2026-08-19", // ignored for HALF
      mode: "HALF",
      counterparts: [cp("Grace", "2026-08-17", "2026-08-20")],
    }));
    expect(r.hasClash).toBe(true);
    expect(r.sharedDays).toEqual(["2026-08-18"]);
  });

  it("HALF request on a weekend day (not covered) → no clash even if counterpart spans it", () => {
    const r = assessClash(clash({
      startISO: "2026-08-15", // Saturday
      endISO: "2026-08-15",
      mode: "HALF",
      counterparts: [cp("Heidi", "2026-08-15", "2026-08-15")],
    }));
    expect(r.hasClash).toBe(false);
  });
});

// ── assessClash — multiple counterparts ──────────────────────────────────────

describe("assessClash — multiple counterparts", () => {
  it("collects all clashing names and unions sharedDays", () => {
    const r = assessClash(clash({
      startISO: "2026-08-17",
      endISO: "2026-08-19",
      mode: "MULTI",
      counterparts: [
        cp("Ivan", "2026-08-17", "2026-08-17"),  // Mon only
        cp("Judy", "2026-08-19", "2026-08-19"),  // Wed only
        cp("Karl", "2026-08-22", "2026-08-22"),  // Mon next week — no overlap
      ],
    }));
    expect(r.hasClash).toBe(true);
    expect(r.clashedNames).toEqual(["Ivan", "Judy"]);
    expect(r.sharedDays).toEqual(["2026-08-17", "2026-08-19"]);
  });

  it("message lists all names separated by comma", () => {
    const r = assessClash(clash({
      startISO: "2026-08-18",
      endISO: "2026-08-18",
      counterparts: [
        cp("Alice", "2026-08-18", "2026-08-18"),
        cp("Bob", "2026-08-18", "2026-08-18"),
      ],
    }));
    expect(r.message).toContain("Alice, Bob");
  });

  it("sharedDays are deduped when two counterparts overlap on same days", () => {
    const r = assessClash(clash({
      startISO: "2026-08-18",
      endISO: "2026-08-18",
      counterparts: [
        cp("A", "2026-08-18", "2026-08-18"),
        cp("B", "2026-08-18", "2026-08-18"),
      ],
    }));
    // Both clash on the same day — sharedDays must not duplicate it.
    expect(r.sharedDays).toEqual(["2026-08-18"]);
  });
});

// ── assessClash — message visibility (no leave-type names) ───────────────────

describe("assessClash — message does NOT reveal leave type", () => {
  it("message contains only name + day count, not a leave-type keyword", () => {
    const r = assessClash(clash({ counterparts: [cp("Alice", "2026-08-18", "2026-08-18")] }));
    // The forbidden words that would reveal leave detail:
    const leaveTypeWords = ["Annual", "Sick", "Unpaid", "Maternity", "Paternity", "WFH", "TOIL"];
    for (const word of leaveTypeWords) {
      expect(r.message).not.toContain(word);
    }
  });
});

// ── validateLeaveRequest — clash wired as advisory warning ───────────────────

const leaveBase = {
  startISO: "2026-08-18" as const,
  endISO: "2026-08-18" as const,
  mode: "DAY" as const,
  cal: uae,
  deductsAllowance: true,
  available: 10,
  existing: [],
};

describe("validateLeaveRequest — clash input", () => {
  it("no clash input → no clash warning", () => {
    const r = validateLeaveRequest(leaveBase);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("clash → warning added, ok stays true (preview only warns)", () => {
    const r = validateLeaveRequest({
      ...leaveBase,
      clash: { counterparts: [cp("Alice", "2026-08-18", "2026-08-18")] },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("Alice");
    expect(r.warnings[0]).toContain("1 shared working day(s)");
  });

  it("empty counterparts → no clash warning", () => {
    const r = validateLeaveRequest({ ...leaveBase, clash: { counterparts: [] } });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("clash + real error: ok:false, both errors and warnings present", () => {
    const r = validateLeaveRequest({
      ...leaveBase,
      available: 0, // over-booking error
      clash: { counterparts: [cp("Bob", "2026-08-18", "2026-08-18")] },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("exceeds your available balance");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("Bob");
  });

  it("overlap only on weekend → no clash warning at preview", () => {
    // Saturday request gets ok:false from the "non-working days only" error, but no clash warning.
    const r = validateLeaveRequest({
      ...leaveBase,
      startISO: "2026-08-15", // Saturday
      endISO: "2026-08-15",
      available: 10,
      clash: { counterparts: [cp("Dave", "2026-08-15", "2026-08-15")] },
    });
    // No shared working day → no clash warning regardless of ok value.
    expect(r.warnings.join()).not.toContain("Dave");
  });
});

// ── decideLeave — clash gate ──────────────────────────────────────────────────

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

function clashInput(counterparts: ClashCounterpart[]): ClashInput {
  return { startISO: "2026-08-18", endISO: "2026-08-18", mode: "DAY", cal: uae, counterparts };
}

describe("decideLeave — clash hard gate (story 29.2)", () => {
  it("no clash input → ok:true, APPROVED, no clash warning", () => {
    const r = decideLeave(approveBase());
    expect(r.ok).toBe(true);
    expect(r.nextStatus).toBe("APPROVED");
    expect(r.warnings).toEqual([]);
  });

  it("clash + no override → ok:false, clash error message, nextStatus null", () => {
    const r = decideLeave(approveBase({
      clash: clashInput([cp("Alice", "2026-08-18", "2026-08-18")]),
    }));
    expect(r.ok).toBe(false);
    expect(r.nextStatus).toBeNull();
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("Alice");
    expect(r.errors[0]).toContain("1 shared working day(s)");
    expect(r.warnings).toEqual([]);
  });

  it("clash + clashOverride=false → still blocked", () => {
    const r = decideLeave(approveBase({
      clash: clashInput([cp("Alice", "2026-08-18", "2026-08-18")]),
      clashOverride: false,
    }));
    expect(r.ok).toBe(false);
  });

  it("clash + clashOverride=true → ok:true, APPROVED, override recorded in warnings", () => {
    const r = decideLeave(approveBase({
      clash: clashInput([cp("Alice", "2026-08-18", "2026-08-18")]),
      clashOverride: true,
    }));
    expect(r.ok).toBe(true);
    expect(r.nextStatus).toBe("APPROVED");
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("Alice");
    expect(r.warnings[0]).toContain("override");
  });

  it("no clash + clashOverride=true → ok:true, no warning (no clash happened)", () => {
    const r = decideLeave(approveBase({
      clash: clashInput([cp("Alice", "2026-08-15", "2026-08-15")]), // Saturday — no shared working day
      clashOverride: true,
    }));
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("over-commit blocks even when clashOverride=true (override is clash-only)", () => {
    const r = decideLeave(approveBase({
      allowanceDays: 20,
      remainingExclR: 5,
      otherPending: 0,
      clash: clashInput([cp("Bob", "2026-08-18", "2026-08-18")]),
      clashOverride: true,
    }));
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([OVER_COMMIT_MESSAGE]);
  });

  it("over-commit blocks even without override — clash doesn't short-circuit over-commit", () => {
    const r = decideLeave(approveBase({
      allowanceDays: 20,
      remainingExclR: 5,
      otherPending: 0,
      clash: clashInput([cp("Carol", "2026-08-18", "2026-08-18")]),
    }));
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([OVER_COMMIT_MESSAGE]);
  });

  it("clash + coverage: both fire; override allows approval + two warnings", () => {
    const r = decideLeave(approveBase({
      clash: clashInput([cp("Dave", "2026-08-18", "2026-08-18")]),
      clashOverride: true,
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
    }));
    expect(r.ok).toBe(true);
    expect(r.nextStatus).toBe("APPROVED");
    // warning[0] = override, warning[1] = coverage
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toContain("override");
    expect(r.warnings[1]).toContain("minimum staffing");
  });

  it("DECLINE path: clash and clashOverride are ignored, warnings:[]", () => {
    const r = decideLeave(approveBase({
      action: "DECLINE",
      reason: "Team already short",
      clash: clashInput([cp("Eve", "2026-08-18", "2026-08-18")]),
    }));
    expect(r.ok).toBe(true);
    expect(r.nextStatus).toBe("DECLINED");
    expect(r.warnings).toEqual([]);
  });
});
