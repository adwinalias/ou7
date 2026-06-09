import { describe, it, expect } from "vitest";
import {
  computeRemaining,
  computeAvailable,
  proRataOpening,
  applyCarryOver,
  canBook,
  donutSegments,
} from "@/core/allowance";
import { countDays } from "@/core/calendar";
import type { RegionCalendar } from "@/core/types";

const uae: RegionCalendar = { weekendDays: [6, 0], holidays: new Set() };

describe("allowance engine", () => {
  it("computes remaining and available (Adwin's real numbers)", () => {
    expect(
      computeRemaining({ opening: 26, carryOver: 0, adjustments: 0, takenApproved: 15, deductions: 0 }),
    ).toBe(11);
    expect(computeAvailable(11, 10)).toBe(1);
  });

  describe("proRataOpening — month-based, ceil (ADR-0009)", () => {
    const ys = "2026-01-01";
    const ye = "2026-12-31";
    const open = (annual: number, joinISO: string) => proRataOpening(annual, joinISO, ys, ye);

    it("grants the full annual (unrounded) to anyone joined on/before the year start", () => {
      expect(open(22, "2025-12-01")).toBe(22); // prior year
      expect(open(22, "2026-01-01")).toBe(22); // exactly year start
      expect(open(22.5, "2025-06-01")).toBe(22.5); // fractional annual stays unrounded
    });

    it("returns 0 for anyone joining after the year", () => {
      expect(open(22, "2027-01-01")).toBe(0);
    });

    it("a January joiner (after Jan 1) gets the full annual (12 months)", () => {
      expect(open(22, "2026-01-15")).toBe(22); // ceil(22/12*12) = 22
    });

    it("a December joiner gets ceil(annual/12) (1 month)", () => {
      expect(open(22, "2026-12-20")).toBe(2); // ceil(22/12) = ceil(1.83) = 2
      expect(open(24, "2026-12-31")).toBe(2); // ceil(24/12) = 2
    });

    it("matches the confirmed sanity values for a March joiner (10 months)", () => {
      expect(open(22, "2026-03-10")).toBe(19); // UAE: ceil(18.33)
      expect(open(21, "2026-03-31")).toBe(18); // KSA: ceil(17.5)
      expect(open(15, "2026-03-01")).toBe(13); // Beirut: ceil(12.5)
      expect(open(22, "2026-03-01")).toBe(19); // Remote (annual 22) == UAE
    });

    it("counts the joining month as a full month regardless of day", () => {
      expect(open(22, "2026-07-01")).toBe(open(22, "2026-07-31")); // both 6 months → ceil(11)=11
      expect(open(22, "2026-07-15")).toBe(11); // ceil(22/12*6) = ceil(11) = 11
    });
  });

  it("applies per-market carry-over cap; null = no carry-over", () => {
    expect(applyCarryOver(8, { capDays: 5 })).toBe(5);
    expect(applyCarryOver(3, { capDays: 5 })).toBe(3);
    expect(applyCarryOver(8, { capDays: null })).toBe(0);
  });

  it("hard-blocks over-booking", () => {
    expect(canBook(1, 1)).toBe(true);
    expect(canBook(1, 2)).toBe(false);
  });
});

describe("calendar day-counting", () => {
  it("excludes weekends (UAE Sat/Sun): Mon 8 → Sun 14 Jun 2026 = 5 working, 2 free", () => {
    const c = countDays("2026-06-08", "2026-06-14", "MULTI", uae);
    expect(c.workingDays).toBe(5);
    expect(c.freeDays).toBe(2);
  });

  it("counts a half day as 0.5", () => {
    expect(countDays("2026-06-08", "2026-06-08", "HALF", uae).workingDays).toBe(0.5);
  });

  it("excludes public holidays", () => {
    const withHoliday: RegionCalendar = { weekendDays: [6, 0], holidays: new Set(["2026-06-09"]) };
    const c = countDays("2026-06-09", "2026-06-09", "DAY", withHoliday);
    expect(c.workingDays).toBe(0);
    expect(c.freeDays).toBe(1);
  });
});

describe("holidayRemaining (v2b Remote holiday ledger)", () => {
  it("is set-days minus taken, engine-derived", async () => {
    const { holidayRemaining } = await import("@/core/allowance");
    expect(holidayRemaining(5)).toBe(5);
    expect(holidayRemaining(5, 2)).toBe(3);
    expect(holidayRemaining(7, 7)).toBe(0);
    expect(holidayRemaining(0.1 + 0.2, 0)).toBe(0.3);
  });
});

describe("donutSegments (Epic 8.1)", () => {
  it("splits into labelled Taken/Pending/Available with fractions summing to 1", () => {
    const { total, segments } = donutSegments({ taken: 5, pending: 3, available: 12 });
    expect(total).toBe(20);
    expect(segments.map((s) => [s.key, s.label, s.value])).toEqual([
      ["taken", "Taken", 5],
      ["pending", "Pending", 3],
      ["available", "Available", 12],
    ]);
    expect(segments.reduce((n, s) => n + s.fraction, 0)).toBeCloseTo(1, 5);
    expect(segments[2]!.fraction).toBeCloseTo(0.6, 5);
  });

  it("returns zero fractions when the total is zero (empty ring)", () => {
    const { total, segments } = donutSegments({ taken: 0, pending: 0, available: 0 });
    expect(total).toBe(0);
    expect(segments.every((s) => s.fraction === 0)).toBe(true);
  });

  it("clamps negatives to zero", () => {
    const { total, segments } = donutSegments({ taken: -2, pending: 0, available: 4 });
    expect(total).toBe(4);
    expect(segments[0]!.value).toBe(0);
    expect(segments[2]!.fraction).toBeCloseTo(1, 5);
  });

  it("always labels every arc (never colour-only)", () => {
    const labels = donutSegments({ taken: 1, pending: 1, available: 1 }).segments.map((s) => s.label);
    expect(labels).toEqual(["Taken", "Pending", "Available"]);
  });
});
