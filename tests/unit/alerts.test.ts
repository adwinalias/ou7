import { describe, expect, it } from "vitest";
import { computeDashboardAlerts, type DashboardAlertsInput } from "../../core/alerts";

// A baseline that fires NO alerts; each test overrides only what it exercises.
function baseInput(over: Partial<DashboardAlertsInput> = {}): DashboardAlertsInput {
  return {
    hasPeriod: true,
    carryOverDays: 0,
    carryOverExpiryMMDD: null,
    todayISO: "2026-06-23",
    pendingApprovalsCount: 0,
    daysBooked: 5, // non-zero so the "0 booked" nudge stays quiet
    ...over,
  };
}

describe("computeDashboardAlerts — purity / determinism", () => {
  it("is deterministic: identical inputs → identical output", () => {
    const input = baseInput({ pendingApprovalsCount: 2 });
    expect(computeDashboardAlerts(input)).toEqual(computeDashboardAlerts(input));
  });

  it("emits no alerts for the quiet baseline", () => {
    expect(computeDashboardAlerts(baseInput())).toEqual([]);
  });
});

describe("carry-over expiring rule", () => {
  // Expiry 03-31; today's year is 2026 → expiry resolves to 2026-03-31.
  it("fires when carry-over > 0 and expiry is within the default 60-day window", () => {
    const out = computeDashboardAlerts(
      baseInput({ carryOverDays: 4, carryOverExpiryMMDD: "03-31", todayISO: "2026-02-15" }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "carry-over-expiring", severity: "warn", href: "/my-leave" });
    expect(out[0]!.message).toContain("4 carry-over days");
    expect(out[0]!.message).toContain("31 Mar");
  });

  it("does NOT fire when there are no carry-over days (boundary: 0 vs >0)", () => {
    expect(
      computeDashboardAlerts(baseInput({ carryOverDays: 0, carryOverExpiryMMDD: "03-31", todayISO: "2026-02-15" })),
    ).toEqual([]);
    expect(
      computeDashboardAlerts(baseInput({ carryOverDays: 1, carryOverExpiryMMDD: "03-31", todayISO: "2026-02-15" })),
    ).toHaveLength(1);
  });

  it("does NOT fire when the policy has no expiry date (null)", () => {
    expect(
      computeDashboardAlerts(baseInput({ carryOverDays: 5, carryOverExpiryMMDD: null })),
    ).toEqual([]);
  });

  it("window edges: fires exactly on the 60-day boundary, not at 61 days out", () => {
    // 2026-03-31 minus 60 days = 2026-01-30; minus 61 = 2026-01-29.
    const onEdge = computeDashboardAlerts(
      baseInput({ carryOverDays: 3, carryOverExpiryMMDD: "03-31", todayISO: "2026-01-30" }),
    );
    expect(onEdge).toHaveLength(1);
    const justOutside = computeDashboardAlerts(
      baseInput({ carryOverDays: 3, carryOverExpiryMMDD: "03-31", todayISO: "2026-01-29" }),
    );
    expect(justOutside).toEqual([]);
  });

  it("fires on the expiry day itself (0 days out) but not the day after (already passed)", () => {
    const onDay = computeDashboardAlerts(
      baseInput({ carryOverDays: 2, carryOverExpiryMMDD: "03-31", todayISO: "2026-03-31" }),
    );
    expect(onDay).toHaveLength(1);
    const dayAfter = computeDashboardAlerts(
      baseInput({ carryOverDays: 2, carryOverExpiryMMDD: "03-31", todayISO: "2026-04-01" }),
    );
    expect(dayAfter).toEqual([]);
  });

  it("respects a custom daysWindow", () => {
    // 30 days out: inside a 30-day window, outside a 14-day one.
    expect(
      computeDashboardAlerts(
        baseInput({ carryOverDays: 1, carryOverExpiryMMDD: "03-31", todayISO: "2026-03-01", daysWindow: 30 }),
      ),
    ).toHaveLength(1);
    expect(
      computeDashboardAlerts(
        baseInput({ carryOverDays: 1, carryOverExpiryMMDD: "03-31", todayISO: "2026-03-01", daysWindow: 14 }),
      ),
    ).toEqual([]);
  });

  it("singular vs plural messaging (1 day vs many)", () => {
    const one = computeDashboardAlerts(
      baseInput({ carryOverDays: 1, carryOverExpiryMMDD: "03-31", todayISO: "2026-03-15" }),
    );
    expect(one[0]!.message).toContain("1 carry-over day ");
    expect(one[0]!.message).toContain("use it or lose it.");
  });

  it("ignores a malformed expiry string (fail-closed, no alert)", () => {
    expect(
      computeDashboardAlerts(baseInput({ carryOverDays: 5, carryOverExpiryMMDD: "garbage", todayISO: "2026-03-15" })),
    ).toEqual([]);
    expect(
      computeDashboardAlerts(baseInput({ carryOverDays: 5, carryOverExpiryMMDD: "13-40", todayISO: "2026-03-15" })),
    ).toEqual([]);
  });
});

describe("pending approvals rule", () => {
  it("fires when count > 0 (boundary: 0 vs >0)", () => {
    expect(computeDashboardAlerts(baseInput({ pendingApprovalsCount: 0 }))).toEqual([]);
    const out = computeDashboardAlerts(baseInput({ pendingApprovalsCount: 1 }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "pending-approvals", severity: "warn", href: "/approvals" });
    expect(out[0]!.message).toContain("1 request is");
  });

  it("pluralises for many", () => {
    const out = computeDashboardAlerts(baseInput({ pendingApprovalsCount: 3 }));
    expect(out[0]!.message).toContain("3 requests are");
  });
});

describe("0 days booked rule", () => {
  it("fires when the viewer has a period and has booked 0 days", () => {
    const out = computeDashboardAlerts(baseInput({ daysBooked: 0 }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "no-days-booked", severity: "info", href: "/request" });
  });

  it("does NOT fire when some days are booked (boundary: 0 vs >0)", () => {
    expect(computeDashboardAlerts(baseInput({ daysBooked: 1 }))).toEqual([]);
  });

  it("no-period case → no '0 booked' alert even when daysBooked is 0", () => {
    expect(computeDashboardAlerts(baseInput({ hasPeriod: false, daysBooked: 0 }))).toEqual([]);
  });
});

describe("ordering + composition", () => {
  it("returns all three in order: carry-over, approvals, 0-booked", () => {
    const out = computeDashboardAlerts(
      baseInput({
        carryOverDays: 2,
        carryOverExpiryMMDD: "03-31",
        todayISO: "2026-03-01",
        pendingApprovalsCount: 4,
        daysBooked: 0,
      }),
    );
    expect(out.map((a) => a.id)).toEqual(["carry-over-expiring", "pending-approvals", "no-days-booked"]);
  });
});
