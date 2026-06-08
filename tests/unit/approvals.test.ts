import { describe, expect, it } from "vitest";
import { OVER_COMMIT_MESSAGE, decideLeave, type DecisionInput } from "../../core/approvals";
import type { LeaveStatus } from "../../core/types";

function base(over: Partial<DecisionInput> = {}): DecisionInput {
  return {
    currentStatus: "PENDING",
    action: "APPROVE",
    deductsAllowance: true,
    allowanceDays: 1,
    remainingExclR: 10,
    otherPending: 0,
    ...over,
  };
}

describe("decideLeave — only PENDING is decidable", () => {
  const nonPending: LeaveStatus[] = ["APPROVED", "DECLINED", "CANCELLED"];
  for (const status of nonPending) {
    it(`rejects ${status} for approve and decline`, () => {
      expect(decideLeave(base({ currentStatus: status, action: "APPROVE" })).ok).toBe(false);
      expect(decideLeave(base({ currentStatus: status, action: "DECLINE", reason: "x" })).ok).toBe(false);
    });
  }
});

describe("decideLeave — decline", () => {
  it("requires a non-empty reason", () => {
    expect(decideLeave(base({ action: "DECLINE" })).ok).toBe(false);
    expect(decideLeave(base({ action: "DECLINE", reason: "   " })).ok).toBe(false);
    expect(decideLeave(base({ action: "DECLINE", reason: "   " })).errors[0]).toMatch(/reason is required/i);
  });

  it("declines with a reason regardless of balance", () => {
    const res = decideLeave(base({ action: "DECLINE", reason: "Too short-staffed", remainingExclR: -100 }));
    expect(res).toEqual({ ok: true, nextStatus: "DECLINED", errors: [] });
  });
});

describe("decideLeave — approve + over-booking re-check", () => {
  it("approves when days fit the remaining capacity", () => {
    const res = decideLeave(base({ allowanceDays: 3, remainingExclR: 10, otherPending: 2 })); // capacity 8
    expect(res).toEqual({ ok: true, nextStatus: "APPROVED", errors: [] });
  });

  it("approves at the exact boundary (days == capacity)", () => {
    const res = decideLeave(base({ allowanceDays: 5, remainingExclR: 7, otherPending: 2 })); // capacity 5
    expect(res.ok).toBe(true);
    expect(res.nextStatus).toBe("APPROVED");
  });

  it("blocks when days exceed capacity, with the explicit HR-adjust message", () => {
    const res = decideLeave(base({ allowanceDays: 6, remainingExclR: 7, otherPending: 2 })); // capacity 5
    expect(res.ok).toBe(false);
    expect(res.nextStatus).toBeNull();
    expect(res.errors).toEqual([OVER_COMMIT_MESSAGE]);
    expect(res.errors[0]).toMatch(/HR must adjust/i);
  });

  it("blocks when capacity is already negative (over-committed balance)", () => {
    const res = decideLeave(base({ allowanceDays: 1, remainingExclR: 0, otherPending: 1 })); // capacity -1
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual([OVER_COMMIT_MESSAGE]);
  });

  it("ignores balance for non-deducting leave types", () => {
    const res = decideLeave(base({ deductsAllowance: false, allowanceDays: 0, remainingExclR: -50, otherPending: 99 }));
    expect(res).toEqual({ ok: true, nextStatus: "APPROVED", errors: [] });
  });

  it("approves a zero-day deducting request even at zero capacity", () => {
    const res = decideLeave(base({ allowanceDays: 0, remainingExclR: 0, otherPending: 0 }));
    expect(res.ok).toBe(true);
  });
});
