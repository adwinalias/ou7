import { describe, it, expect } from "vitest";
import { computeAvailable, computeRemaining } from "@/core/allowance";
import { allowanceBreakdown, type BreakdownInput } from "@/lib/allowance-breakdown";

// Epic 18.4 (H4/AD9): the grouped breakdown must reconcile EXACTLY to Available for ALL
// inputs — sum(held) − sum(used) === available — so the displayed parts can never
// contradict the headline. We derive remaining/available with the SAME engine the app uses
// (no hand-stored numbers) then assert the breakdown reconciles.

function fromRaw(raw: {
  opening: number;
  carryOver: number;
  adjustments: number;
  takenApproved: number;
  pending: number;
  deductions: number;
}): BreakdownInput {
  const remaining = computeRemaining({
    opening: raw.opening,
    carryOver: raw.carryOver,
    adjustments: raw.adjustments,
    takenApproved: raw.takenApproved,
    deductions: raw.deductions,
  });
  const available = computeAvailable(remaining, raw.pending);
  return { ...raw, remaining, available };
}

type Raw = Parameters<typeof fromRaw>[0];

const SIMPLE: Raw = { opening: 20, carryOver: 5, adjustments: 0, takenApproved: 8, pending: 2, deductions: 0 };
const BOTH_NONZERO: Raw = { opening: 18, carryOver: 2, adjustments: 3, takenApproved: 6, pending: 4, deductions: 2 };

const cases: { name: string; raw: Raw }[] = [
  { name: "AD9 simple case — adjustments=deductions=0", raw: SIMPLE },
  {
    name: "non-zero positive adjustments",
    raw: { opening: 22, carryOver: 3, adjustments: 4, takenApproved: 10, pending: 1, deductions: 0 },
  },
  {
    name: "negative adjustments (HR correction down)",
    raw: { opening: 22, carryOver: 0, adjustments: -2.5, takenApproved: 5, pending: 0, deductions: 0 },
  },
  {
    name: "non-zero deductions",
    raw: { opening: 26, carryOver: 5, adjustments: 0, takenApproved: 15, pending: 10, deductions: 1.5 },
  },
  { name: "adjustments AND deductions both non-zero", raw: BOTH_NONZERO },
  {
    name: "zero everywhere",
    raw: { opening: 0, carryOver: 0, adjustments: 0, takenApproved: 0, pending: 0, deductions: 0 },
  },
];

describe("allowanceBreakdown — reconciles to Available", () => {
  for (const { name, raw } of cases) {
    it(name, () => {
      const b = allowanceBreakdown(fromRaw(raw));
      // Core invariant: held − used === available.
      expect(b.heldTotal - b.usedTotal).toBe(b.available);
    });
  }

  it("surfaces Carry-over as its own line, always", () => {
    const b = allowanceBreakdown(fromRaw(SIMPLE));
    expect(b.held.find((r) => r.key === "carryOver")?.label).toBe("Carry over from last year");
  });

  it("hides Adjustments/Deductions when zero, shows them when non-zero", () => {
    const zero = allowanceBreakdown(fromRaw(SIMPLE));
    expect(zero.held.some((r) => r.key === "adjustments")).toBe(false);
    expect(zero.used.some((r) => r.key === "deductions")).toBe(false);

    const nz = allowanceBreakdown(fromRaw(BOTH_NONZERO));
    expect(nz.held.some((r) => r.key === "adjustments")).toBe(true);
    expect(nz.used.some((r) => r.key === "deductions")).toBe(true);
  });

  it("AD9: Opening + Carry-over − Taken − Pending = Available (no adj/ded)", () => {
    const b = allowanceBreakdown(fromRaw(SIMPLE));
    expect(SIMPLE.opening + SIMPLE.carryOver - SIMPLE.takenApproved - SIMPLE.pending).toBe(b.available);
  });
});
