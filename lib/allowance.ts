// Shared balance reads. The arithmetic lives in core/allowance (pure); this assembles
// the inputs from the DB so both lib/leave (preview/submit) and lib/approvals (the
// approval-time over-booking re-check) compute balances the same way.
import type { Prisma } from "@prisma/client";
import { computeAvailable, computeRemaining } from "@/core/allowance";
import { db } from "./db";

// Works against the base client or a transaction client.
type Client = Prisma.TransactionClient;

export interface PeriodBalance {
  periodId: string;
  opening: number;
  carryOver: number;
  adjustments: number;
  takenApproved: number;
  deductions: number;
  pending: number;
  remaining: number;
  available: number;
}

/** Sum APPROVED/PENDING allowance days for a period, optionally excluding one request. */
async function sumDays(client: Client, periodId: string, excludeRequestId?: string) {
  const grouped = await client.leaveRequest.groupBy({
    by: ["status"],
    where: {
      allowancePeriodId: periodId,
      status: { in: ["APPROVED", "PENDING"] },
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
    },
    _sum: { allowanceDays: true },
  });
  return {
    takenApproved: grouped.find((g) => g.status === "APPROVED")?._sum.allowanceDays ?? 0,
    pending: grouped.find((g) => g.status === "PENDING")?._sum.allowanceDays ?? 0,
  };
}

/** The employee's current open allowance period + computed balance (null if none). */
export async function getOpenPeriodBalance(employeeId: string): Promise<PeriodBalance | null> {
  const period = await db.allowancePeriod.findFirst({
    where: { employeeId, endDate: null },
    orderBy: { startDate: "desc" },
  });
  if (!period) return null;

  const { takenApproved, pending } = await sumDays(db, period.id);
  const remaining = computeRemaining({
    opening: period.opening,
    carryOver: period.carryOver,
    adjustments: period.adjustments,
    takenApproved,
    deductions: period.deductions,
  });
  return {
    periodId: period.id,
    opening: period.opening,
    carryOver: period.carryOver,
    adjustments: period.adjustments,
    takenApproved,
    deductions: period.deductions,
    pending,
    remaining,
    available: computeAvailable(remaining, pending),
  };
}

export interface YearPeriodBalance extends PeriodBalance {
  startISO: string;
  endISO: string | null;
  year: number;
}

/** Every allowance period for an employee (open + closed) with engine-computed balances,
 *  newest first — for the My-Leave allowance panel (Epic 7.3). */
export async function getAllPeriodBalances(employeeId: string): Promise<YearPeriodBalance[]> {
  const periods = await db.allowancePeriod.findMany({ where: { employeeId }, orderBy: { startDate: "desc" } });
  const out: YearPeriodBalance[] = [];
  for (const p of periods) {
    const { takenApproved, pending } = await sumDays(db, p.id);
    const remaining = computeRemaining({
      opening: p.opening,
      carryOver: p.carryOver,
      adjustments: p.adjustments,
      takenApproved,
      deductions: p.deductions,
    });
    out.push({
      periodId: p.id,
      opening: p.opening,
      carryOver: p.carryOver,
      adjustments: p.adjustments,
      takenApproved,
      deductions: p.deductions,
      pending,
      remaining,
      available: computeAvailable(remaining, pending),
      startISO: p.startDate.toISOString().slice(0, 10),
      endISO: p.endDate ? p.endDate.toISOString().slice(0, 10) : null,
      year: p.startDate.getUTCFullYear(),
    });
  }
  return out;
}

/**
 * Balance for a period EXCLUDING one request — used inside the approval transaction to
 * re-check over-booking for the request being decided. Run after locking the period row.
 */
export async function periodBalanceExcluding(client: Client, periodId: string, excludeRequestId: string) {
  const period = await client.allowancePeriod.findUniqueOrThrow({ where: { id: periodId } });
  const { takenApproved, pending } = await sumDays(client, periodId, excludeRequestId);
  const remainingExclR = computeRemaining({
    opening: period.opening,
    carryOver: period.carryOver,
    adjustments: period.adjustments,
    takenApproved,
    deductions: period.deductions,
  });
  return { remainingExclR, otherPending: pending };
}
