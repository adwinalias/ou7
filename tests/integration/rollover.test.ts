// Integration test for rolloverYear (Epic 24.1 / ADR-0013). Seeds an employee with a prior-year
// OPEN period + some approved (taken) leave, rolls the year, and asserts: the new Y+1 period's
// opening + carry-over match the pure computeRollover; the prior period is CLOSED (endDate set)
// with its financial fields UNCHANGED; and rolling again is a no-op. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeRollover } from "@/core/allowance";
import { rolloverYear } from "@/lib/allowance-admin";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[rollover.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "ro-it-";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
let regionId = "";
let empId = "";
let actorId = "";
let priorPeriodId = "";
let leaveTypeId = "";

suite("Year rollover (integration)", () => {
  beforeAll(async () => {
    const region = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    regionId = region.id;
    await db.entitlementPolicy.upsert({
      where: { regionId_role: { regionId, role: "STAFF" } },
      update: { annualDays: 22, carryOverCapDays: 5, carryOverExpiry: "03-31" },
      create: { regionId, role: "STAFF", annualDays: 22, carryOverCapDays: 5, carryOverExpiry: "03-31" },
    });
    const lt = await db.leaveType.upsert({
      where: { code: "ROIT" },
      update: {},
      create: { name: "Rollover IT", code: "ROIT", color: "#123456", deductsAllowance: true, paid: true, noteRequired: false },
    });
    leaveTypeId = lt.id;

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowanceAdjustment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });

    empId = (await db.employee.create({ data: { email: `${PREFIX}emp@interestingtimes.me`, firstName: "Roll", lastName: "Over", regionId, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    actorId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "Roll", lastName: "HR", regionId, joiningDate: day("2024-01-01"), role: "HR" } })).id;

    // Prior-year (2026) OPEN period: opening 22, carryOver 0 → remaining 22 before taken.
    const prior = await db.allowancePeriod.create({ data: { employeeId: empId, regionId, startDate: day("2026-01-01"), opening: 22, carryOver: 0 } });
    priorPeriodId = prior.id;

    // 8 approved days taken in the prior year → prior remaining = 22 − 8 = 14 (carry caps at 5).
    await db.leaveRequest.create({
      data: { employeeId: empId, leaveTypeId, startDate: day("2026-06-01"), endDate: day("2026-06-10"), status: "APPROVED", allowanceDays: 8, allowancePeriodId: priorPeriodId },
    });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowanceAdjustment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: "ROIT" } });
    await db.$disconnect();
  });

  it("rolls 2026 → 2027 with engine-derived opening + capped carry-over, closing the prior period unchanged", async () => {
    const res = await rolloverYear(actorId, empId, 2026);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.created) throw new Error("expected a created rollover");

    const expected = computeRollover({ annualDays: 22, joiningISO: "2024-01-01", nextYear: 2027, priorRemaining: 14, carryOverCapDays: 5 });
    expect(expected).toEqual({ opening: 22, carryOver: 5 });
    expect(res.opening).toBe(22);
    expect(res.carryOver).toBe(5);

    // New 2027 period.
    const next = await db.allowancePeriod.findUniqueOrThrow({ where: { id: res.newPeriodId } });
    expect(next.startDate.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(next.endDate).toBeNull();
    expect(next.opening).toBe(22);
    expect(next.carryOver).toBe(5);
    expect(next.regionId).toBe(regionId);

    // Prior period: CLOSED, financials immutable.
    const prior = await db.allowancePeriod.findUniqueOrThrow({ where: { id: priorPeriodId } });
    expect(prior.endDate?.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(prior.opening).toBe(22);
    expect(prior.carryOver).toBe(0);
    expect(prior.adjustments).toBe(0);
    expect(prior.deductions).toBe(0);

    // Audited.
    expect(await db.auditEvent.findFirst({ where: { action: "YEAR_ROLLOVER", entityId: res.newPeriodId } })).toBeTruthy();
  });

  it("rolling the same year again is a guarded no-op (no double-create, prior untouched)", async () => {
    const before = await db.allowancePeriod.count({ where: { employeeId: empId } });
    const res = await rolloverYear(actorId, empId, 2026);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(false);
    expect(await db.allowancePeriod.count({ where: { employeeId: empId } })).toBe(before);
  });
});
