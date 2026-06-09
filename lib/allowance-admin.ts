// Allowance management (Epic 9.2 / ADR-0009). HR adjusts allowance via an audited LEDGER;
// the AllowancePeriod.adjustments/deductions columns are a DERIVED projection (sum of the
// ledger), recomputed under a period-row lock so concurrent writers can't drop a delta.
// Reset/Add Balance recomputes OPENING only, via the engine, from the entitlement policy.
// Balances stay engine-derived — only inputs are ever stored.
import type { AdjustmentKind } from "@prisma/client";
import { computeRemaining, proRataOpening, round } from "@/core/allowance";
import { recordAudit } from "./audit";
import { getEntitlementPolicy } from "./config";
import { db } from "./db";

const atUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);

export type LedgerResult = { ok: true; warning?: string } | { ok: false; error: string };

/**
 * Append a ledger entry (ADJUSTMENT signed, or DEDUCTION positive) and recompute the
 * period's input projections. Locks the period row FIRST so two concurrent entries can't
 * each recompute from a stale ledger and drop the other's delta. Audited. A resulting
 * negative Remaining is ALLOWED but returned as a warning.
 */
export async function addLedgerEntry(
  actorId: string,
  periodId: string,
  input: { kind: AdjustmentKind; delta: number; reason: string },
): Promise<LedgerResult> {
  if (!input.reason?.trim()) return { ok: false, error: "A reason is required." };
  if (!Number.isFinite(input.delta) || input.delta === 0) return { ok: false, error: "Enter a non-zero number of days." };

  return db.$transaction(async (tx) => {
    // Lock the period row so the recompute below serializes with any concurrent entry.
    await tx.$queryRaw`SELECT id FROM "AllowancePeriod" WHERE id = ${periodId} FOR UPDATE`;
    const period = await tx.allowancePeriod.findUnique({ where: { id: periodId } });
    if (!period) return { ok: false as const, error: "Allowance period not found." };

    await tx.allowanceAdjustment.create({
      data: { employeeId: period.employeeId, periodId, kind: input.kind, delta: input.delta, reason: input.reason.trim(), actorId },
    });

    // Recompute the projection from the full ledger (now including this row), under the lock.
    const sums = await tx.allowanceAdjustment.groupBy({ by: ["kind"], where: { periodId }, _sum: { delta: true } });
    const adjustments = round(sums.find((s) => s.kind === "ADJUSTMENT")?._sum.delta ?? 0);
    const deductions = round(sums.find((s) => s.kind === "DEDUCTION")?._sum.delta ?? 0);
    await tx.allowancePeriod.update({ where: { id: periodId }, data: { adjustments, deductions } });

    await recordAudit(tx, {
      actorId,
      action: input.kind === "ADJUSTMENT" ? "ADJUSTMENT_ADD" : "DEDUCTION_ADD",
      entity: "AllowancePeriod",
      entityId: periodId,
      before: { adjustments: period.adjustments, deductions: period.deductions },
      after: { adjustments, deductions, delta: input.delta, reason: input.reason.trim() },
    });

    const takenApproved = (await tx.leaveRequest.aggregate({ where: { allowancePeriodId: periodId, status: "APPROVED" }, _sum: { allowanceDays: true } }))._sum.allowanceDays ?? 0;
    const remaining = computeRemaining({ opening: period.opening, carryOver: period.carryOver, adjustments, deductions, takenApproved });
    return remaining < 0
      ? { ok: true as const, warning: `Applied. Remaining is now ${remaining} day(s) — negative.` }
      : { ok: true as const };
  });
}

export interface ResetPreview {
  hasPolicy: boolean;
  currentOpening: number | null; // null = no period yet (would be "Add Balance")
  proposedOpening: number | null;
  annualDays: number | null;
}

/** Before→after for Reset, without writing. */
export async function previewReset(employeeId: string, year: number): Promise<ResetPreview> {
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { regionId: true, role: true, joiningDate: true } });
  const policy = await getEntitlementPolicy(emp.regionId, emp.role);
  const period = await db.allowancePeriod.findFirst({ where: { employeeId, endDate: null } });
  if (!policy) return { hasPolicy: false, currentOpening: period?.opening ?? null, proposedOpening: null, annualDays: null };
  const proposedOpening = proRataOpening(policy.annualDays, toISO(emp.joiningDate), `${year}-01-01`, `${year}-12-31`);
  return { hasPolicy: true, currentOpening: period?.opening ?? null, proposedOpening, annualDays: policy.annualDays };
}

export type ResetResult = { ok: true; opening: number; created: boolean } | { ok: false; error: string };

/**
 * Reset / Add Balance: recompute OPENING only from the policy via the engine. Leaves
 * carry-over and adjustments untouched (no clean-slate). Locks the period row. If no period
 * exists, "Add Balance" creates one via the same engine path. Stops if no policy. Audited.
 */
export async function resetBalance(actorId: string, employeeId: string, year: number): Promise<ResetResult> {
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { regionId: true, role: true, joiningDate: true } });
  const policy = await getEntitlementPolicy(emp.regionId, emp.role);
  if (!policy) return { ok: false, error: "No entitlement policy is configured for this employee's region and role. Set it under Admin → Configuration first." };
  const opening = proRataOpening(policy.annualDays, toISO(emp.joiningDate), `${year}-01-01`, `${year}-12-31`);

  return db.$transaction(async (tx) => {
    const existing = await tx.allowancePeriod.findFirst({ where: { employeeId, endDate: null } });
    if (!existing) {
      const created = await tx.allowancePeriod.create({ data: { employeeId, regionId: emp.regionId, startDate: atUtc(`${year}-01-01`), opening, carryOver: 0 } });
      await recordAudit(tx, { actorId, action: "ALLOWANCE_ADD", entity: "AllowancePeriod", entityId: created.id, after: { opening, annualDays: policy.annualDays, joiningISO: toISO(emp.joiningDate) } });
      return { ok: true as const, opening, created: true };
    }
    await tx.$queryRaw`SELECT id FROM "AllowancePeriod" WHERE id = ${existing.id} FOR UPDATE`;
    await tx.allowancePeriod.update({ where: { id: existing.id }, data: { opening } }); // carry-over + adjustments untouched
    await recordAudit(tx, { actorId, action: "ALLOWANCE_RESET", entity: "AllowancePeriod", entityId: existing.id, before: { opening: existing.opening }, after: { opening, annualDays: policy.annualDays, joiningISO: toISO(emp.joiningDate) } });
    return { ok: true as const, opening, created: false };
  });
}

export async function listAdjustments(periodId: string) {
  const rows = await db.allowanceAdjustment.findMany({
    where: { periodId },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    delta: r.delta,
    reason: r.reason,
    actorName: r.actor ? `${r.actor.firstName} ${r.actor.lastName}`.trim() : "—",
    createdAtISO: r.createdAt.toISOString().slice(0, 10),
  }));
}
