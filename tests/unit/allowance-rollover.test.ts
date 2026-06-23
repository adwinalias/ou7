// Exhaustive unit tests for the PURE year-rollover combinator (Epic 24.1 / ADR-0013).
// computeRollover composes the LOCKED engine rules (proRataOpening + applyCarryOver) and must
// never mutate prior-year inputs. We assert opening, carry-over cap behaviour, the 0/negative
// floor, idempotence (deterministic), and edge years — and that it agrees with the underlying
// locked fns it reuses.
import { describe, it, expect } from "vitest";
import { applyCarryOver, computeRollover, proRataOpening } from "@/core/allowance";

const roll = (over: Partial<Parameters<typeof computeRollover>[0]> = {}) =>
  computeRollover({ annualDays: 22, joiningISO: "2024-01-01", nextYear: 2027, priorRemaining: 3, carryOverCapDays: 5, ...over });

describe("computeRollover — pure year rollover (ADR-0013)", () => {
  describe("opening — full annual for existing staff, pro-rata for joiners", () => {
    it("grants the full annual to staff who joined on/before the next year start", () => {
      expect(roll({ joiningISO: "2024-01-01" }).opening).toBe(22); // long-standing
      expect(roll({ joiningISO: "2027-01-01" }).opening).toBe(22); // exactly the year start
      expect(roll({ annualDays: 22.5, joiningISO: "2026-06-01" }).opening).toBe(22.5); // fractional, unrounded
    });

    it("pro-rates a mid-next-year joiner (month-based ceil), matching proRataOpening", () => {
      const got = roll({ joiningISO: "2027-03-10", annualDays: 22 }).opening;
      expect(got).toBe(proRataOpening(22, "2027-03-10", "2027-01-01", "2027-12-31"));
      expect(got).toBe(19); // ceil(22/12 * 10)
    });

    it("is 0 for someone who joins after the next year", () => {
      expect(roll({ joiningISO: "2028-01-01" }).opening).toBe(0);
    });

    it("uses the nextYear bounds, not the current year", () => {
      // A Feb-2027 joiner rolling into 2027 pro-rates; the same join into 2028 is full annual.
      expect(roll({ nextYear: 2027, joiningISO: "2027-02-15" }).opening).toBe(proRataOpening(22, "2027-02-15", "2027-01-01", "2027-12-31"));
      expect(roll({ nextYear: 2028, joiningISO: "2027-02-15" }).opening).toBe(22);
    });
  });

  describe("carry-over — capped per market, floored at 0", () => {
    it("carries the prior remaining when below the cap", () => {
      expect(roll({ priorRemaining: 3, carryOverCapDays: 5 }).carryOver).toBe(3);
      expect(roll({ priorRemaining: 4.5, carryOverCapDays: 5 }).carryOver).toBe(4.5);
    });

    it("caps at exactly the cap when prior remaining exceeds it", () => {
      expect(roll({ priorRemaining: 9, carryOverCapDays: 5 }).carryOver).toBe(5);
      expect(roll({ priorRemaining: 5.0001, carryOverCapDays: 5 }).carryOver).toBe(5);
    });

    it("carries exactly the cap when prior remaining equals it", () => {
      expect(roll({ priorRemaining: 5, carryOverCapDays: 5 }).carryOver).toBe(5);
    });

    it("carries 0 when prior remaining is 0 or negative", () => {
      expect(roll({ priorRemaining: 0, carryOverCapDays: 5 }).carryOver).toBe(0);
      expect(roll({ priorRemaining: -2, carryOverCapDays: 5 }).carryOver).toBe(0);
    });

    it("carries 0 when the market has no carry-over (cap null)", () => {
      expect(roll({ priorRemaining: 9, carryOverCapDays: null }).carryOver).toBe(0);
    });

    it("agrees with the locked applyCarryOver for every cap", () => {
      for (const cap of [null, 0, 5, 10]) {
        for (const rem of [-3, 0, 2.5, 5, 12]) {
          expect(roll({ priorRemaining: rem, carryOverCapDays: cap }).carryOver).toBe(applyCarryOver(rem, { capDays: cap }));
        }
      }
    });
  });

  it("is deterministic / idempotent — same input, same output (history never mutated)", () => {
    const a = roll({ priorRemaining: 7, carryOverCapDays: 5, joiningISO: "2027-04-01" });
    const b = roll({ priorRemaining: 7, carryOverCapDays: 5, joiningISO: "2027-04-01" });
    expect(a).toEqual(b);
    expect(a).toEqual({ opening: proRataOpening(22, "2027-04-01", "2027-01-01", "2027-12-31"), carryOver: 5 });
  });

  it("composes both rules together (full-year staff over the cap → full annual + cap)", () => {
    expect(roll({ joiningISO: "2024-01-01", priorRemaining: 30, carryOverCapDays: 5 })).toEqual({ opening: 22, carryOver: 5 });
  });
});
