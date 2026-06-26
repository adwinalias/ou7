// Approval state machine + decision rules. Pure, deterministic, exhaustively tested.
// No I/O, no DB, no AI. lib/approvals assembles the balance numbers (inside a locked
// transaction) and asks decideLeave() whether the transition is allowed.
//
// "Debiting" the allowance is NOT done here and is never a hand-written number: once a
// request becomes APPROVED, core/allowance counts its days as taken. This function only
// decides whether that transition may happen — including a fresh over-booking check.
import { canBook } from "../allowance";
import { assessCoverage, type CoverageInput } from "../leave";
import type { LeaveStatus } from "../types";

export type DecisionAction = "APPROVE" | "DECLINE";

export interface DecisionInput {
  currentStatus: LeaveStatus;
  action: DecisionAction;
  /** Required (non-empty) to decline; ignored for approve. */
  reason?: string;
  deductsAllowance: boolean;
  allowanceDays: number;
  /** opening + carry-over + adjustments − taken(excluding this request) − deductions. */
  remainingExclR: number;
  /** Pending allowance days for the same period, excluding this request. */
  otherPending: number;
  /** Story 28.1: optional coverage check inputs (ADR-0014). Advisory only — never sets ok:false. */
  coverage?: CoverageInput;
}

export interface DecisionResult {
  ok: boolean;
  nextStatus: LeaveStatus | null;
  errors: string[];
  /** Advisory warnings (e.g. coverage breach at approval). Never drives ok:false. */
  warnings: string[];
}

// Explicit message: an over-committed balance is an HR data problem (e.g. an adjustment
// reduced the allowance after submission), not something the approver can resolve.
export const OVER_COMMIT_MESSAGE =
  "Approving this would over-commit the employee's allowance. HR must adjust the over-committed balance before it can be approved.";

export function decideLeave(input: DecisionInput): DecisionResult {
  if (input.currentStatus !== "PENDING") {
    return { ok: false, nextStatus: null, errors: ["Only pending requests can be approved or declined."], warnings: [] };
  }

  if (input.action === "DECLINE") {
    if (!input.reason?.trim()) {
      return { ok: false, nextStatus: null, errors: ["A reason is required to decline."], warnings: [] };
    }
    return { ok: true, nextStatus: "DECLINED", errors: [], warnings: [] };
  }

  // APPROVE — re-check over-booking against the current balance (deducting types only).
  if (input.deductsAllowance) {
    const capacity = input.remainingExclR - input.otherPending;
    if (!canBook(capacity, input.allowanceDays)) {
      return { ok: false, nextStatus: null, errors: [OVER_COMMIT_MESSAGE], warnings: [] };
    }
  }

  // Coverage check (ADR-0014, story 28.1) — advisory only; approval still succeeds.
  const warnings: string[] = [];
  if (input.coverage) {
    const cv = assessCoverage(input.coverage);
    if (cv.warning) warnings.push(cv.warning);
  }

  return { ok: true, nextStatus: "APPROVED", errors: [], warnings };
}
