// Remote-only Holiday allowance (v2b / ADR-0010): a separate, HR-set, per-year, non-carry
// balance. The stored `days` is the input; remaining is engine-derived
// (core/allowance.holidayRemaining). HR writes are audited.
import { recordAudit } from "./audit";
import { db } from "./db";

const DEFAULT_DAYS = 5;

/** Is this employee in the Remote region (the only region with a holiday ledger)? */
async function isRemote(employeeId: string): Promise<boolean> {
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { region: { select: { name: true } } } });
  return emp?.region.name === "Remote";
}

/** The Remote employee's set holiday days for the year (defaults to 5 if unset); null for
 *  non-Remote employees (no holiday ledger). */
export async function getHolidayBalance(employeeId: string, year: number): Promise<number | null> {
  if (!(await isRemote(employeeId))) return null;
  const row = await db.holidayBalance.findUnique({ where: { employeeId_year: { employeeId, year } } });
  return row?.days ?? DEFAULT_DAYS;
}

export type SetHolidayResult = { ok: true; days: number } | { ok: false; error: string };

export async function setHolidayBalance(actorId: string, employeeId: string, year: number, days: number): Promise<SetHolidayResult> {
  if (!Number.isFinite(days) || days < 0) return { ok: false, error: "Enter a non-negative number of days." };
  if (!(await isRemote(employeeId))) return { ok: false, error: "The Holiday allowance applies to Remote employees only." };

  const before = await db.holidayBalance.findUnique({ where: { employeeId_year: { employeeId, year } } });
  await db.holidayBalance.upsert({
    where: { employeeId_year: { employeeId, year } },
    update: { days },
    create: { employeeId, year, days },
  });
  await recordAudit(db, {
    actorId,
    action: "HOLIDAY_BALANCE_SET",
    entity: "HolidayBalance",
    entityId: employeeId,
    before: before ? { year, days: before.days } : { year, days: DEFAULT_DAYS },
    after: { year, days },
  });
  return { ok: true, days };
}
