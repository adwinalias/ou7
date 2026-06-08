import { describe, it, expect } from "vitest";
import {
  computeRemaining,
  computeAvailable,
  proRataOpening,
  applyCarryOver,
  canBook,
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

  it("grants full allowance upfront to early joiners, pro-rates mid-year joiners", () => {
    expect(proRataOpening(26, "2025-12-01", "2026-01-01", "2026-12-31")).toBe(26);
    const half = proRataOpening(24, "2026-07-01", "2026-01-01", "2026-12-31");
    expect(half).toBeGreaterThan(11.5);
    expect(half).toBeLessThan(12.5);
    expect(proRataOpening(26, "2027-01-01", "2026-01-01", "2026-12-31")).toBe(0);
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
