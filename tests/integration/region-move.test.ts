// Story 30.2 — Effective-dated region assignment (ADR-0015).
//
// Tests:
//   1. Backfill: a fresh employee resolves to their joining region for any date ≥ joining.
//   2. Move Beirut→KSA: creates an EmployeeRegionAssignment row + REGION_CHANGE audit.
//   3. Booking before the move uses Beirut's calendar; on/after uses KSA's calendar.
//      (Beirut weekend=Sat/Sun; KSA weekend=Fri/Sat — they diverge on Friday.)
//   4. An EXISTING booking is unchanged after the move (snapshot invariant, ties to 30.1).
//   5. Wall chart: for a month after the move, effectiveRegionId resolves to KSA.
//
// Self-skips when Postgres is unreachable, matching the project integration-test convention.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { updateEmployee } from "@/lib/employees";
import { decideLeaveRequest } from "@/lib/approvals";
import { getOpenPeriodBalance } from "@/lib/allowance";
import { submitLeave } from "@/lib/leave";
import { regionIdOnDate, batchRegionAssignments } from "@/lib/region";
import { regionOnDate } from "@/core/region";
import type { Actor } from "@/core/types";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[region-move.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "rm30-";
const VCODE = "RM30V";

let beirutId = "";
let ksaId = "";
let employeeId = "";
let actorId = "";
let typeId = "";
let periodId = "";

// Dates chosen so Beirut(weekend=Sat/Sun) and KSA(weekend=Fri/Sat) diverge on Friday.
// Friday 2027-03-05 is:  Beirut → working day;  KSA → weekend.
const MOVE_DATE = "2027-02-01"; // region move becomes effective
const BEFORE_MOVE = "2027-01-08"; // Thursday — Beirut working (unambiguous)
const ON_MOVE = "2027-03-05"; // Friday ON/AFTER move: KSA weekend, Beirut working → diverge
const AFTER_MOVE = "2027-03-06"; // Saturday — both regions' weekend → still rejected either way

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const actor = (over: Partial<Actor> & Pick<Actor, "employeeId" | "role">): Actor => ({
  approverLevel: "NONE",
  status: "ACTIVE",
  approverForIds: [],
  ...over,
});

suite("Effective-dated region assignment (story 30.2 / ADR-0015)", () => {
  beforeAll(async () => {
    // Beirut: weekend = Sat(6), Sun(0) — same as UAE convention
    beirutId = (await db.region.upsert({ where: { name: "Beirut-rm30" }, update: {}, create: { name: "Beirut-rm30", weekendDays: [6, 0] } })).id;
    // KSA: weekend = Fri(5), Sat(6)
    ksaId = (await db.region.upsert({ where: { name: "KSA-rm30" }, update: {}, create: { name: "KSA-rm30", weekendDays: [5, 6] } })).id;

    // Clean up any leftovers from a previous run.
    await db.auditEvent.deleteMany({ where: { entity: "Employee", entityId: { startsWith: "rm30" } } });
    await db.employeeRegionAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: VCODE } });

    typeId = (await db.leaveType.create({
      data: { name: "RM30 Vacation", code: VCODE, color: "#2F6FEB", deductsAllowance: true },
    })).id;

    actorId = (await db.employee.create({
      data: {
        email: `${PREFIX}hr@interestingtimes.me`,
        firstName: "HR",
        lastName: "Actor",
        regionId: beirutId,
        joiningDate: day("2024-01-01"),
        role: "HR",
        approverLevel: "APPROVER",
      },
    })).id;

    employeeId = (await db.employee.create({
      data: {
        email: `${PREFIX}emp@interestingtimes.me`,
        firstName: "Region",
        lastName: "Mover",
        regionId: beirutId,
        joiningDate: day("2026-01-01"),
        role: "STAFF",
      },
    })).id;

    // Seed the backfill-style initial assignment (mirrors what the migration does).
    await db.employeeRegionAssignment.create({
      data: { employeeId, regionId: beirutId, effectiveFrom: day("2026-01-01") },
    });

    await db.approverAssignment.create({ data: { employeeId, approverId: actorId } });

    periodId = (await db.allowancePeriod.create({
      data: { employeeId, regionId: beirutId, startDate: day("2027-01-01"), opening: 20 },
    })).id;
  });

  beforeEach(async () => {
    // Clean leave requests between tests; leave assignments + period in place.
    await db.leaveRequest.deleteMany({ where: { employeeId } });
  });

  afterAll(async () => {
    // Scope audit cleanup to this suite's actors only — never wipe all Employee audit rows.
    await db.auditEvent.deleteMany({ where: { actorId: { in: [actorId, employeeId] } } });
    await db.employeeRegionAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: VCODE } });
    await db.region.deleteMany({ where: { name: { in: ["Beirut-rm30", "KSA-rm30"] } } });
    await db.$disconnect();
  });

  it("backfill: fresh employee resolves to joining region for date >= joining", async () => {
    const resolved = await regionIdOnDate(employeeId, "2026-06-15");
    expect(resolved).toBe(beirutId);
  });

  it("backfill: regionIdOnDate returns fallback (employee.regionId) for a date before any assignment", async () => {
    // date before 2026-01-01 → no assignment, falls back to Employee.regionId cache
    const resolved = await regionIdOnDate(employeeId, "2025-12-31");
    expect(resolved).toBe(beirutId); // fallback = Employee.regionId = beirutId at this point
  });

  it("move Beirut→KSA creates EmployeeRegionAssignment row and REGION_CHANGE audit", async () => {
    await updateEmployee(actorId, employeeId, {
      regionId: ksaId,
      regionEffectiveFrom: MOVE_DATE,
    });

    // Assignment row created.
    const assignment = await db.employeeRegionAssignment.findFirst({
      where: { employeeId, regionId: ksaId },
      select: { regionId: true, effectiveFrom: true },
    });
    expect(assignment).not.toBeNull();
    expect(assignment?.regionId).toBe(ksaId);
    expect(assignment?.effectiveFrom.toISOString().slice(0, 10)).toBe(MOVE_DATE);

    // REGION_CHANGE audit recorded.
    const audit = await db.auditEvent.findFirst({
      where: { action: "REGION_CHANGE", entityId: employeeId },
    });
    expect(audit).not.toBeNull();
    expect((audit?.after as { regionId?: string })?.regionId).toBe(ksaId);
    expect((audit?.after as { effectiveFrom?: string })?.effectiveFrom).toBe(MOVE_DATE);
    expect((audit?.before as { regionId?: string })?.regionId).toBe(beirutId);

    // Employee.regionId cache updated.
    const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { regionId: true } });
    expect(emp.regionId).toBe(ksaId);
  });

  it("booking BEFORE the move date uses Beirut calendar (Friday is working day)", async () => {
    // Thursday 2027-01-08 — working in both regions; just confirms Beirut region is used before move.
    const submit = await submitLeave(employeeId, {
      leaveTypeId: typeId,
      mode: "DAY",
      startDate: BEFORE_MOVE, // Thursday — working in both
    });
    expect(submit.ok).toBe(true);
    if (submit.ok) {
      const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: submit.id }, select: { workingDays: true } });
      expect(row.workingDays).toBe(1); // Thursday is a working day in Beirut
    }
  });

  it("booking ON/AFTER the move date uses KSA calendar (Friday is KSA weekend = rejected)", async () => {
    // Friday 2027-03-05 — after move date 2027-02-01; KSA weekend, Beirut working.
    // KSA rejects booking a non-working day.
    const submit = await submitLeave(employeeId, {
      leaveTypeId: typeId,
      mode: "DAY",
      startDate: ON_MOVE, // Friday 2027-03-05
    });
    // KSA: Friday is weekend → 0 working days → engine rejects.
    if (submit.ok) {
      const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: submit.id }, select: { workingDays: true } });
      expect(row.workingDays).toBe(0); // accepted but 0 working days in KSA
    } else {
      // Preferred path: engine rejects booking on a KSA weekend.
      expect(submit.errors.length).toBeGreaterThan(0);
    }
  });

  it("existing APPROVED booking counts and balance are unchanged after a region move (snapshot invariant)", async () => {
    // This test is the real snapshot-freeze proof. The chosen dates diverge between regions
    // so a recompute regression would change the numbers.
    //
    // 2027-01-06 (Wed) – 2027-01-08 (Fri):
    //   Beirut (weekend Sat/Sun): Wed+Thu+Fri = 3 working days, 0 free.
    //   KSA    (weekend Fri/Sat): Wed+Thu     = 2 working days, 1 free (Fri is KSA weekend).
    // A buggy path that recomputes against the new region after the move would return 2, not 3.
    const SNAP_START = "2027-01-06"; // Wednesday
    const SNAP_END   = "2027-01-08"; // Friday

    // Reset employee back to Beirut first so the booking is created under Beirut's calendar.
    // (Other tests may have moved it to KSA via updateEmployee.)
    await db.employee.update({ where: { id: employeeId }, data: { regionId: beirutId } });
    // Also remove any KSA assignment row so regionIdOnDate resolves to Beirut on SNAP_START.
    await db.employeeRegionAssignment.deleteMany({ where: { employeeId, regionId: ksaId } });

    // Submit Wed–Fri in Beirut = 3 working days.
    const submit = await submitLeave(employeeId, {
      leaveTypeId: typeId,
      mode: "MULTI",
      startDate: SNAP_START,
      endDate: SNAP_END,
    });
    expect(submit.ok, "submit should succeed in Beirut calendar").toBe(true);
    if (!submit.ok) return;

    // Approve so allowance is debited and balance is observable.
    const approved = await decideLeaveRequest(
      actor({ employeeId: actorId, role: "HR", approverLevel: "APPROVER", approverForIds: [employeeId] }),
      submit.id,
      "APPROVE",
    );
    expect(approved.ok).toBe(true);

    // Capture snapshot + balance BEFORE the region move.
    const rowBefore = await db.leaveRequest.findUniqueOrThrow({
      where: { id: submit.id },
      select: { workingDays: true, freeDays: true, allowanceDays: true },
    });
    expect(rowBefore.workingDays).toBe(3);   // Wed+Thu+Fri in Beirut
    expect(rowBefore.freeDays).toBe(0);
    expect(rowBefore.allowanceDays).toBe(3);

    const balBefore = await getOpenPeriodBalance(employeeId);
    expect(balBefore?.takenApproved).toBe(3);

    // Move employee Beirut→KSA effective ON the booking's start date.
    // If the engine wrongly recomputed, it would see Wed+Thu (2 days) for a KSA calendar.
    await updateEmployee(actorId, employeeId, {
      regionId: ksaId,
      regionEffectiveFrom: SNAP_START,
    });

    // Stored counts MUST be unchanged.
    const rowAfter = await db.leaveRequest.findUniqueOrThrow({
      where: { id: submit.id },
      select: { workingDays: true, freeDays: true, allowanceDays: true },
    });
    expect(rowAfter.workingDays).toBe(3);
    expect(rowAfter.freeDays).toBe(0);
    expect(rowAfter.allowanceDays).toBe(3);

    // Balance MUST be unchanged — still reflects the 3-day snapshot.
    const balAfter = await getOpenPeriodBalance(employeeId);
    expect(balAfter?.takenApproved).toBe(balBefore?.takenApproved);
    expect(balAfter?.available).toBe(balBefore?.available);
  });

  it("batchRegionAssignments: resolves to KSA for a month AFTER the move", async () => {
    // Month start = 2027-03-01 (after MOVE_DATE 2027-02-01)
    const monthStart = "2027-03-01";
    const map = await batchRegionAssignments([employeeId]);
    const entry = map.get(employeeId)!;
    const resolved = regionOnDate(entry.assignments, monthStart) ?? entry.fallbackRegionId;
    expect(resolved).toBe(ksaId);
  });

  it("batchRegionAssignments: resolves to Beirut for a month BEFORE the move", async () => {
    const monthStart = "2026-12-01"; // before MOVE_DATE 2027-02-01
    const map = await batchRegionAssignments([employeeId]);
    const entry = map.get(employeeId)!;
    const resolved = regionOnDate(entry.assignments, monthStart) ?? entry.fallbackRegionId;
    expect(resolved).toBe(beirutId);
  });
});
