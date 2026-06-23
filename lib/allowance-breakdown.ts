// Pure presentational helper (no I/O) for Epic 18.4 — the shared, labelled allowance
// breakdown used on the dashboard widget, My-leave panel and Admin allowance view.
//
// It groups the already-computed/already-read figures so the displayed parts can NEVER
// contradict the headline (the H4/AD9 fix):
//   held  = Opening + Carry-over (+ Adjustments if ≠ 0)
//   used  = Taken   + Pending    (+ Deductions  if ≠ 0)
//   available = held − used  (identically equal to engine `available`)
//
// It does NOT recompute remaining/available — it consumes the engine-derived values and
// asserts (by construction) that sum(held) − sum(used) === available. The unit test in
// tests/unit/allowance-breakdown.test.ts proves that reconciliation across inputs.
import { round } from "@/core/allowance";

export interface BreakdownInput {
  opening: number;
  carryOver: number;
  adjustments: number;
  takenApproved: number;
  pending: number;
  deductions: number;
  remaining: number;
  available: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
}

export interface AllowanceBreakdownView {
  /** Days held: Opening + Carry-over (+ Adjustments if non-zero). */
  held: BreakdownRow[];
  /** Days used or requested: Taken + Pending (+ Deductions if non-zero). */
  used: BreakdownRow[];
  /** Sum of the held rows (total held). */
  heldTotal: number;
  /** Sum of the used rows (total used/requested). */
  usedTotal: number;
  remaining: number;
  available: number;
}

/**
 * Build the grouped breakdown rows. Adjustments and Deductions are surfaced ONLY when
 * non-zero so the common case stays Opening + Carry-over − Taken − Pending = Available,
 * while non-zero/negative adjustments and non-zero deductions still reconcile exactly.
 */
export function allowanceBreakdown(b: BreakdownInput): AllowanceBreakdownView {
  const held: BreakdownRow[] = [
    { key: "opening", label: "Opening", value: b.opening },
    { key: "carryOver", label: "Carry over from last year", value: b.carryOver },
  ];
  if (b.adjustments !== 0) held.push({ key: "adjustments", label: "Adjustments", value: b.adjustments });

  const used: BreakdownRow[] = [
    { key: "taken", label: "Taken", value: b.takenApproved },
    { key: "pending", label: "Pending", value: b.pending },
  ];
  if (b.deductions !== 0) used.push({ key: "deductions", label: "Deductions", value: b.deductions });

  const heldTotal = round(held.reduce((s, r) => s + r.value, 0));
  const usedTotal = round(used.reduce((s, r) => s + r.value, 0));

  return { held, used, heldTotal, usedTotal, remaining: b.remaining, available: b.available };
}
