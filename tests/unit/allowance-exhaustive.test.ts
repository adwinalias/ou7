// Epic 22.5 — exhaustiveness supplement for the allowance engine (core/allowance). The
// primary suite is tests/unit/allowance.test.ts; this file closes the remaining branches so
// EVERY exported pure function and edge is covered: rounding, the full Remaining ledger
// (carry-over + adjustments + deductions), the carry-over negative clamp, half-day booking,
// the canBook epsilon boundary, and the holiday bucket being NON-carry. Deterministic, no I/O.
import { describe, expect, it } from "vitest";
import {
  applyCarryOver,
  canBook,
  computeAvailable,
  computeRemaining,
  holidayRemaining,
  proRataOpening,
  round,
  roundToHalf,
} from "@/core/allowance";

describe("round / roundToHalf (float-noise guards)", () => {
  it("round defaults to 2 dp and kills float noise", () => {
    expect(round(0.1 + 0.2)).toBe(0.3); // 0.30000000000000004 → 0.3
    expect(round(1.005)).toBe(1.01); // EPSILON nudge lands it on 1.01, not 1.00
    expect(round(2.344, 1)).toBe(2.3);
    expect(round(10)).toBe(10);
  });
  it("roundToHalf snaps to the nearest 0.5 (leave is booked in whole/half days)", () => {
    expect(roundToHalf(0.24)).toBe(0);
    expect(roundToHalf(0.25)).toBe(0.5);
    expect(roundToHalf(0.74)).toBe(0.5);
    expect(roundToHalf(0.75)).toBe(1);
    expect(roundToHalf(2.5)).toBe(2.5);
  });
});

describe("computeRemaining — full ledger (Opening + Carry + Adj − Taken − Deductions)", () => {
  it("sums every input including carry-over, adjustments and deductions", () => {
    expect(
      computeRemaining({ opening: 22, carryOver: 5, adjustments: 2, takenApproved: 6, deductions: 1.5 }),
    ).toBe(21.5);
  });
  it("supports a negative net (over-drawn) result and stays float-clean", () => {
    expect(
      computeRemaining({ opening: 10, carryOver: 0, adjustments: 0, takenApproved: 12.3, deductions: 0 }),
    ).toBe(-2.3);
  });
  it("computeAvailable subtracts pending and rounds", () => {
    expect(computeAvailable(11, 10)).toBe(1);
    expect(computeAvailable(11.1, 0.2)).toBe(10.9);
    expect(computeAvailable(0, 0.5)).toBe(-0.5); // pending can exceed remaining (negative available)
  });
});

describe("applyCarryOver — cap + clamp + null (no-carry) markets", () => {
  it("caps at the market cap (UAE cap 5)", () => {
    expect(applyCarryOver(8, { capDays: 5 })).toBe(5);
  });
  it("carries the full remaining when under the cap", () => {
    expect(applyCarryOver(3, { capDays: 5 })).toBe(3);
  });
  it("clamps a NEGATIVE previous remaining to 0 (never carries debt)", () => {
    expect(applyCarryOver(-4, { capDays: 5 })).toBe(0);
  });
  it("carries fractional half-days under the cap", () => {
    expect(applyCarryOver(2.5, { capDays: 5 })).toBe(2.5);
  });
  it("null cap = no carry-over at all (e.g. a no-carry market)", () => {
    expect(applyCarryOver(8, { capDays: null })).toBe(0);
    expect(applyCarryOver(0, { capDays: null })).toBe(0);
  });
});

describe("canBook — half-days + the over-booking hard block at the epsilon boundary", () => {
  it("allows an exact fit and a half-day fit", () => {
    expect(canBook(1, 1)).toBe(true);
    expect(canBook(0.5, 0.5)).toBe(true);
    expect(canBook(2, 0.5)).toBe(true);
  });
  it("hard-blocks anything beyond available (no borrowing)", () => {
    expect(canBook(1, 2)).toBe(false);
    expect(canBook(0, 0.5)).toBe(false);
    expect(canBook(0.5, 1)).toBe(false);
  });
  it("tolerates float noise within 1e-9 but blocks real over-booking", () => {
    expect(canBook(0.3, 0.1 + 0.2)).toBe(true); // 0.30000000000000004 vs 0.3
    expect(canBook(1, 1 + 1e-6)).toBe(false); // beyond the epsilon → blocked
  });
});

describe("proRataOpening — fractional annual + month boundaries (ADR-0009 ceil)", () => {
  const ys = "2026-01-01";
  const ye = "2026-12-31";
  const open = (annual: number, joinISO: string) => proRataOpening(annual, joinISO, ys, ye);
  it("ceils a fractional pro-rata for a mid-year joiner", () => {
    expect(open(22.5, "2026-07-01")).toBe(12); // 22.5/12*6 = 11.25 → ceil 12
  });
  it("a June joiner gets 7 months, ceiled", () => {
    expect(open(22, "2026-06-30")).toBe(13); // 22/12*7 = 12.83 → 13
  });
  it("joined exactly on the year-end (Dec) → one month", () => {
    expect(open(12, "2026-12-31")).toBe(1); // ceil(12/12*1) = 1
  });
});

describe("holidayRemaining — Remote bucket is NON-carry, engine-derived (ADR-0010)", () => {
  it("is set-days minus taken, never the previous year's leftover", () => {
    expect(holidayRemaining(5)).toBe(5); // taken defaults to 0
    expect(holidayRemaining(5, 2)).toBe(3);
    expect(holidayRemaining(7, 7)).toBe(0);
  });
  it("can go negative if over-consumed (surfaced as a warning upstream)", () => {
    expect(holidayRemaining(2, 3)).toBe(-1);
  });
  it("stays float-clean on fractional half-day holidays", () => {
    expect(holidayRemaining(0.1 + 0.2, 0)).toBe(0.3);
    expect(holidayRemaining(3, 0.5)).toBe(2.5);
  });
});
