import "server-only"; // Epic 22.4: DB-backed HR allowance ledger — server-only.
// Allowance management (Epic 9.2 / ADR-0009). HR adjusts allowance via an audited LEDGER;
// the AllowancePeriod.adjustments/deductions columns are a DERIVED projection (sum of the
// ledger), recomputed under a period-row lock so concurrent writers can't drop a delta.
// Reset/Add Balance recomputes OPENING only, via the engine, from the entitlement policy.
// Balances stay engine-derived — only inputs are ever stored.
import type { AdjustmentKind, AllowanceBucket } from "@prisma/client";
import { computeRemaining, computeRollover, proRataOpening, round } from "@/core/allowance";
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
 *
 * The entry's `bucket` (24.3 / ADR-0013) routes the delta: a VACATION ADJUSTMENT feeds the
 * `adjustments` projection (annual remaining, exactly today's behaviour); a PUBLIC_HOLIDAY
 * ADJUSTMENT feeds the `publicHolidays` projection (NOT annual remaining). DEDUCTIONs feed
 * `deductions` regardless of bucket, as before. `bucket` defaults to VACATION.
 */
export async function addLedgerEntry(
  actorId: string,
  periodId: string,
  input: { kind: AdjustmentKind; bucket?: AllowanceBucket; delta: number; reason: string },
): Promise<LedgerResult> {
  if (!input.reason?.trim()) return { ok: false, error: "A reason is required." };
  if (!Number.isFinite(input.delta) || input.delta === 0) return { ok: false, error: "Enter a non-zero number of days." };
  const bucket: AllowanceBucket = input.bucket ?? "VACATION";

  return db.$transaction(async (tx) => {
    // Lock the period row so the recompute below serializes with any concurrent entry.
    await tx.$queryRaw`SELECT id FROM "AllowancePeriod" WHERE id = ${periodId} FOR UPDATE`;
    const period = await tx.allowancePeriod.findUnique({ where: { id: periodId } });
    if (!period) return { ok: false as const, error: "Allowance period not found." };

    await tx.allowanceAdjustment.create({
      data: { employeeId: period.employeeId, periodId, kind: input.kind, bucket, delta: input.delta, reason: input.reason.trim(), actorId },
    });

    // Recompute the projections from the full ledger (now including this row), under the lock,
    // routed by bucket. `adjustments` (annual remaining) is VACATION-bucket ADJUSTMENTs only;
    // `publicHolidays` is PUBLIC_HOLIDAY-bucket ADJUSTMENTs (no other base writes this column);
    // `deductions` is all DEDUCTIONs, as before. computeRemaining still receives only the
    // VACATION `adjustments` sum, so annual remaining is unchanged for VACATION entries.
    const sums = await tx.allowanceAdjustment.groupBy({ by: ["kind", "bucket"], where: { periodId }, _sum: { delta: true } });
    const sumOf = (kind: AdjustmentKind, b?: AllowanceBucket) =>
      sums.filter((s) => s.kind === kind && (b === undefined || s.bucket === b)).reduce((acc, s) => acc + (s._sum.delta ?? 0), 0);
    const adjustments = round(sumOf("ADJUSTMENT", "VACATION"));
    const publicHolidays = round(sumOf("ADJUSTMENT", "PUBLIC_HOLIDAY"));
    const deductions = round(sumOf("DEDUCTION"));
    await tx.allowancePeriod.update({ where: { id: periodId }, data: { adjustments, publicHolidays, deductions } });

    await recordAudit(tx, {
      actorId,
      action: input.kind === "ADJUSTMENT" ? "ADJUSTMENT_ADD" : "DEDUCTION_ADD",
      entity: "AllowancePeriod",
      entityId: periodId,
      before: { adjustments: period.adjustments, publicHolidays: period.publicHolidays, deductions: period.deductions },
      after: { adjustments, publicHolidays, deductions, bucket, delta: input.delta, reason: input.reason.trim() },
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

export type RolloverResult =
  | { ok: true; created: true; opening: number; carryOver: number; newPeriodId: string; nextYear: number }
  | { ok: true; created: false; reason: "ALREADY_ROLLED" | "NO_OPEN_PERIOD"; nextYear: number }
  | { ok: false; error: string };

/**
 * Year rollover (Epic 24.1 / ADR-0013), HR-only at the call site. In ONE transaction:
 * load the employee's `fromYear` OPEN period + its engine-derived remaining + the region×role
 * entitlement policy; CLOSE the current period (set `endDate = ${fromYear}-12-31` only — its
 * financial fields stay immutable); CREATE the `fromYear+1` period with `opening`+`carryOver`
 * from the pure `computeRollover` (which reuses the locked engine rules). Audited
 * (`YEAR_ROLLOVER`). Idempotent/guarded: if a `fromYear+1` period already exists it is a no-op,
 * and the prior period is left untouched.
 */
export async function rolloverYear(actorId: string, employeeId: string, fromYear: number): Promise<RolloverResult> {
  const nextYear = fromYear + 1;
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { regionId: true, role: true, joiningDate: true } });
  const policy = await getEntitlementPolicy(emp.regionId, emp.role);
  if (!policy) return { ok: false, error: "No entitlement policy is configured for this employee's region and role. Set it under Admin → Configuration first." };

  return db.$transaction(async (tx) => {
    // Find the open period to roll (we need its id to lock). Lock it FIRST, then re-check the
    // guards UNDER the lock so two concurrent rolls of the same employee can't both create a
    // next-year period (READ COMMITTED; no unique backstop). Both txns serialize on this row.
    const open = await tx.allowancePeriod.findFirst({ where: { employeeId, endDate: null }, orderBy: { startDate: "desc" } });
    if (!open) {
      // No open period: either nothing to roll, or a concurrent/prior roll already closed it.
      const alreadyNext = await tx.allowancePeriod.findFirst({
        where: { employeeId, startDate: { gte: atUtc(`${nextYear}-01-01`), lte: atUtc(`${nextYear}-12-31`) } },
      });
      return alreadyNext
        ? { ok: true as const, created: false as const, reason: "ALREADY_ROLLED" as const, nextYear }
        : { ok: true as const, created: false as const, reason: "NO_OPEN_PERIOD" as const, nextYear };
    }

    // Lock the period row so the guards + close serialize with any concurrent rollover/write.
    await tx.$queryRaw`SELECT id FROM "AllowancePeriod" WHERE id = ${open.id} FOR UPDATE`;

    // Re-read state UNDER the lock — a concurrent roll may have closed `open` or created the
    // next-year period between the findFirst above and acquiring the lock.
    const current = await tx.allowancePeriod.findUnique({ where: { id: open.id } });
    if (!current || current.endDate !== null) {
      return { ok: true as const, created: false as const, reason: "ALREADY_ROLLED" as const, nextYear };
    }
    const nextExisting = await tx.allowancePeriod.findFirst({
      where: { employeeId, startDate: { gte: atUtc(`${nextYear}-01-01`), lte: atUtc(`${nextYear}-12-31`) } },
    });
    if (nextExisting) return { ok: true as const, created: false as const, reason: "ALREADY_ROLLED" as const, nextYear };

    // Prior-year remaining, engine-derived from the (now locked) period inputs.
    const takenApproved = (await tx.leaveRequest.aggregate({ where: { allowancePeriodId: current.id, status: "APPROVED" }, _sum: { allowanceDays: true } }))._sum.allowanceDays ?? 0;
    const priorRemaining = computeRemaining({
      opening: current.opening,
      carryOver: current.carryOver,
      adjustments: current.adjustments,
      deductions: current.deductions,
      takenApproved,
    });

    const { opening, carryOver } = computeRollover({
      annualDays: policy.annualDays,
      joiningISO: toISO(emp.joiningDate),
      nextYear,
      priorRemaining,
      carryOverCapDays: policy.carryOverCapDays,
    });

    // Close the current period — ONLY set endDate; financial fields are immutable.
    await tx.allowancePeriod.update({ where: { id: current.id }, data: { endDate: atUtc(`${fromYear}-12-31`) } });

    // Create the next-year period, region snapshotted from the closing period.
    const created = await tx.allowancePeriod.create({
      data: { employeeId, regionId: current.regionId, startDate: atUtc(`${nextYear}-01-01`), opening, carryOver },
    });

    await recordAudit(tx, {
      actorId,
      action: "YEAR_ROLLOVER",
      entity: "AllowancePeriod",
      entityId: created.id,
      before: { closedPeriodId: current.id, fromYear, priorRemaining },
      after: { newPeriodId: created.id, nextYear, opening, carryOver, annualDays: policy.annualDays, carryOverCapDays: policy.carryOverCapDays },
    });

    return { ok: true as const, created: true as const, opening, carryOver, newPeriodId: created.id, nextYear };
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
    bucket: r.bucket,
    delta: r.delta,
    reason: r.reason,
    actorName: r.actor ? `${r.actor.firstName} ${r.actor.lastName}`.trim() : "—",
    createdAtISO: r.createdAt.toISOString().slice(0, 10),
  }));
}
