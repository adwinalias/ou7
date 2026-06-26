// Story 30.3 — Day-count integrity check tool (ADR-0015). READ-ONLY.
//
// Tests:
//   1. A booking whose stored snapshot matches a recompute (consistent) is NOT flagged.
//   2. A Beirut Wed–Fri booking (stored 3 wd) after the employee is moved to KSA effective
//      ON the start date IS flagged: recompute against KSA gives 2 wd (Fri is KSA weekend).
//   3. The tool performs NO mutation: stored counts on the flagged row are still 3/0/3 after
//      calling findDayCountDiscrepancies().
//
// Self-skips when Postgres is unreachable.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findDayCountDiscrepancies } from "@/lib/integrity";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[integrity-check.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "ic30-";
const VCODE_IC = "IC30V";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let beirutId = "";
let ksaId = "";
let employeeId = "";
let approverId = "";
let typeId = "";
let periodId = "";

// Wed 2027-05-05 → Fri 2027-05-07 (FUTURE dates, safe for integration).
// Beirut (weekend Sat/Sun): Wed + Thu + Fri = 3 working days.
// KSA   (weekend Fri/Sat): Wed + Thu       = 2 working days (Fri is KSA weekend).
const START = "2027-05-05"; // Wednesday
const END   = "2027-05-07"; // Friday

suite("Day-count integrity check (story 30.3 / ADR-0015)", () => {
  beforeAll(async () => {
    beirutId = (await db.region.upsert({
      where: { name: "Beirut-ic30" },
      update: {},
      create: { name: "Beirut-ic30", weekendDays: [6, 0] }, // Sat(6) + Sun(0)
    })).id;
    ksaId = (await db.region.upsert({
      where: { name: "KSA-ic30" },
      update: {},
      create: { name: "KSA-ic30", weekendDays: [5, 6] }, // Fri(5) + Sat(6)
    })).id;

    // Clean up any leftovers from a previous run.
    await db.employeeRegionAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: VCODE_IC } });

    typeId = (await db.leaveType.create({
      data: { name: "IC30 Vacation", code: VCODE_IC, color: "#2F6FEB", deductsAllowance: true },
    })).id;

    approverId = (await db.employee.create({
      data: {
        email: `${PREFIX}hr@interestingtimes.me`,
        firstName: "IC30",
        lastName: "HR",
        regionId: beirutId,
        joiningDate: day("2024-01-01"),
        role: "HR",
        approverLevel: "APPROVER",
      },
    })).id;

    employeeId = (await db.employee.create({
      data: {
        email: `${PREFIX}emp@interestingtimes.me`,
        firstName: "IC30",
        lastName: "Emp",
        regionId: beirutId,
        joiningDate: day("2024-01-01"),
        role: "STAFF",
      },
    })).id;

    // Seed initial region assignment (mirrors the ADR-0015 backfill).
    await db.employeeRegionAssignment.create({
      data: { employeeId, regionId: beirutId, effectiveFrom: day("2024-01-01") },
    });

    await db.approverAssignment.create({ data: { employeeId, approverId } });

    periodId = (await db.allowancePeriod.create({
      data: { employeeId, regionId: beirutId, startDate: day("2027-01-01"), opening: 20 },
    })).id;
  });

  beforeEach(async () => {
    // Remove any region assignments added mid-test (except the initial Beirut one).
    await db.employeeRegionAssignment.deleteMany({ where: { employeeId, regionId: ksaId } });
    // Reset employee.regionId cache to Beirut.
    await db.employee.update({ where: { id: employeeId }, data: { regionId: beirutId } });
    await db.leaveRequest.deleteMany({ where: { employeeId } });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: { in: [employeeId, approverId] } } });
    await db.employeeRegionAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: VCODE_IC } });
    await db.region.deleteMany({ where: { name: { in: ["Beirut-ic30", "KSA-ic30"] } } });
    await db.$disconnect();
  });

  it("consistent booking (region unchanged) is NOT flagged", async () => {
    // Insert a correctly-snapshotted booking: Wed–Fri Beirut = 3 wd, 0 fd, 3 alw.
    await db.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: typeId,
        startDate: day(START),
        endDate: day(END),
        durationMode: "MULTI",
        workingDays: 3,
        freeDays: 0,
        allowanceDays: 3,
        status: "APPROVED",
        allowancePeriodId: periodId,
        createdById: employeeId,
      },
    });

    // Employee is still on Beirut — no KSA assignment. Recompute = 3 wd → no drift.
    const discrepancies = await findDayCountDiscrepancies();
    const mine = discrepancies.filter((d) => d.startISO === START);
    expect(mine).toHaveLength(0);
  });

  it("booking flagged when employee moved to KSA effective on start date", async () => {
    // 1. Insert the booking snapshotted under Beirut: 3 wd, 0 fd, 3 alw.
    const req = await db.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: typeId,
        startDate: day(START),
        endDate: day(END),
        durationMode: "MULTI",
        workingDays: 3,
        freeDays: 0,
        allowanceDays: 3,
        status: "APPROVED",
        allowancePeriodId: periodId,
        createdById: employeeId,
      },
    });

    // 2. Move employee to KSA effective ON the booking's start date.
    //    The region effective on START is now KSA (Fri=weekend), so recompute gives 2 wd.
    await db.employeeRegionAssignment.create({
      data: { employeeId, regionId: ksaId, effectiveFrom: day(START) },
    });
    await db.employee.update({ where: { id: employeeId }, data: { regionId: ksaId } });

    // 3. Run the integrity check — must flag this request.
    const discrepancies = await findDayCountDiscrepancies();
    const flagged = discrepancies.find((d) => d.requestId === req.id);

    expect(flagged).toBeDefined();
    expect(flagged!.stored.workingDays).toBe(3);
    expect(flagged!.stored.freeDays).toBe(0);
    expect(flagged!.stored.allowanceDays).toBe(3);
    expect(flagged!.recomputed.workingDays).toBe(2);
    expect(flagged!.recomputed.freeDays).toBe(1);  // Fri is a KSA weekend = free day
    expect(flagged!.recomputed.allowanceDays).toBe(2);
    expect(flagged!.effectiveRegionName).toContain("KSA");
    expect(flagged!.explanation).toContain("3");   // stored wd
    expect(flagged!.explanation).toContain("2");   // recomputed wd
    expect(flagged!.explanation).toContain("KSA"); // region name
  });

  it("tool performs NO mutation — stored counts unchanged after running check", async () => {
    // 1. Same setup: Beirut-snapshotted booking + KSA move on start date.
    const req = await db.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: typeId,
        startDate: day(START),
        endDate: day(END),
        durationMode: "MULTI",
        workingDays: 3,
        freeDays: 0,
        allowanceDays: 3,
        status: "PENDING",
        allowancePeriodId: periodId,
        createdById: employeeId,
      },
    });

    await db.employeeRegionAssignment.create({
      data: { employeeId, regionId: ksaId, effectiveFrom: day(START) },
    });
    await db.employee.update({ where: { id: employeeId }, data: { regionId: ksaId } });

    // 2. Run the check.
    const discrepancies = await findDayCountDiscrepancies();
    const flagged = discrepancies.find((d) => d.requestId === req.id);
    expect(flagged).toBeDefined(); // ensure it was flagged (not a false pass)

    // 3. Re-read the row directly from DB — stored counts must be exactly 3/0/3.
    const row = await db.leaveRequest.findUniqueOrThrow({
      where: { id: req.id },
      select: { workingDays: true, freeDays: true, allowanceDays: true },
    });
    expect(row.workingDays).toBe(3);
    expect(row.freeDays).toBe(0);
    expect(row.allowanceDays).toBe(3);
  });
});
