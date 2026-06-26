// Story 30.1 — Formalise & guard the day-count snapshot (ADR-0015).
//
// Invariant under test: LeaveRequest.{workingDays, freeDays, allowanceDays} are written
// ONCE at creation and are NEVER recomputed when an employee changes region. A region move
// must not retroactively alter the stored counts or the derived balance.
//
// Self-skips when Postgres is unreachable, matching the project integration-test convention.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decideLeaveRequest } from "@/lib/approvals";
import { getOpenPeriodBalance } from "@/lib/allowance";
import { backfillLeaveDayCounts } from "@/lib/backfill";
import { submitLeave } from "@/lib/leave";
import { db } from "@/lib/db";
import type { Actor } from "@/core/types";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[daycount-snapshot.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "dcs-it-";
const VCODE = "DCSV";

let uaeId = "";
let ksaId = "";
let employeeId = "";
let approverId = "";
let typeId = "";
let periodId = "";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const actor = (over: Partial<Actor> & Pick<Actor, "employeeId" | "role">): Actor => ({
  approverLevel: "NONE",
  status: "ACTIVE",
  approverForIds: [],
  ...over,
});

// Wed 2026-12-09 → Fri 2026-12-11 (inclusive).
// UAE (weekend=Sat/Sun):  Wed + Thu + Fri = 3 working days.
// KSA (weekend=Fri/Sat):  Wed + Thu       = 2 working days (Fri is a KSA weekend).
// A regression that recomputed allowanceDays against the NEW region after a move would return
// 2, not 3, so the post-move assertion of "still 3" would fail — making this a genuine proof.
const START = "2026-12-09"; // Wednesday
const END   = "2026-12-11"; // Friday

// Same Friday used for the "new booking uses new region" sanity case.
const FRI = "2026-12-11";

suite("Day-count snapshot invariant (ADR-0015)", () => {
  beforeAll(async () => {
    // UAE: weekend = Sat(6), Sun(0)
    uaeId = (await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } })).id;
    // KSA: weekend = Fri(5), Sat(6) — Fri is a working day in UAE but not in KSA
    ksaId = (await db.region.upsert({ where: { name: "KSA" }, update: {}, create: { name: "KSA", weekendDays: [5, 6] } })).id;

    // Clean up any leftovers from a previous run.
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: VCODE } });

    typeId = (await db.leaveType.create({
      data: { name: "DCS Vacation", code: VCODE, color: "#2F6FEB", deductsAllowance: true },
    })).id;

    employeeId = (await db.employee.create({
      data: {
        email: `${PREFIX}emp@interestingtimes.me`,
        firstName: "Snap",
        lastName: "Shot",
        regionId: uaeId,
        joiningDate: day("2024-01-01"),
        role: "STAFF",
      },
    })).id;

    approverId = (await db.employee.create({
      data: {
        email: `${PREFIX}apr@interestingtimes.me`,
        firstName: "App",
        lastName: "Rover",
        regionId: uaeId,
        joiningDate: day("2024-01-01"),
        role: "APPROVER",
        approverLevel: "APPROVER",
      },
    })).id;

    await db.approverAssignment.create({ data: { employeeId, approverId } });

    periodId = (await db.allowancePeriod.create({
      data: { employeeId, regionId: uaeId, startDate: day("2026-01-01"), opening: 20 },
    })).id;
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId } });
    // Reset employee back to UAE before each test.
    await db.employee.update({ where: { id: employeeId }, data: { regionId: uaeId } });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: { in: [employeeId, approverId] } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: VCODE } });
    await db.$disconnect();
  });

  it("region move does NOT change stored day-counts or balance for an existing approved request", async () => {
    // 1. Submit Wed–Fri in UAE = 3 working days (Fri is a UAE working day, KSA weekend).
    const submit = await submitLeave(employeeId, {
      leaveTypeId: typeId,
      mode: "MULTI",
      startDate: START,
      endDate: END,
    });
    expect(submit.ok).toBe(true);
    if (!submit.ok) return;

    const reqId = submit.id;

    // 2. Approve it so allowance is debited.
    const approveRes = await decideLeaveRequest(
      actor({ employeeId: approverId, role: "APPROVER", approverLevel: "APPROVER", approverForIds: [employeeId] }),
      reqId,
      "APPROVE",
    );
    expect(approveRes.ok).toBe(true);

    // 3. Capture snapshot values and balance before the region move.
    const rowBefore = await db.leaveRequest.findUniqueOrThrow({
      where: { id: reqId },
      select: { workingDays: true, freeDays: true, allowanceDays: true },
    });
    // UAE (weekend=Sat/Sun): Wed+Thu+Fri = 3 working days, 0 free days.
    // KSA (weekend=Fri/Sat) would compute Wed+Thu = 2 — the regions diverge on this range.
    expect(rowBefore.workingDays).toBe(3);
    expect(rowBefore.freeDays).toBe(0);
    expect(rowBefore.allowanceDays).toBe(3);

    const balBefore = await getOpenPeriodBalance(employeeId);
    expect(balBefore?.takenApproved).toBe(3);
    expect(balBefore?.available).toBe(17); // 20 − 3

    // 4. Move employee to KSA (weekend = Fri/Sat). A recompute of Wed-Fri against KSA would
    //    yield 2 working days (Fri is a KSA weekend), not 3. The invariant: stored values stay 3.
    await db.employee.update({ where: { id: employeeId }, data: { regionId: ksaId } });

    // 5. Re-read row and balance — MUST be unchanged.
    const rowAfter = await db.leaveRequest.findUniqueOrThrow({
      where: { id: reqId },
      select: { workingDays: true, freeDays: true, allowanceDays: true },
    });
    expect(rowAfter.workingDays).toBe(rowBefore.workingDays);
    expect(rowAfter.freeDays).toBe(rowBefore.freeDays);
    expect(rowAfter.allowanceDays).toBe(rowBefore.allowanceDays);

    const balAfter = await getOpenPeriodBalance(employeeId);
    expect(balAfter?.takenApproved).toBe(balBefore?.takenApproved);
    expect(balAfter?.available).toBe(balBefore?.available);
  });

  it("new booking after region move uses the NEW region calendar", async () => {
    // Move employee to KSA first.
    await db.employee.update({ where: { id: employeeId }, data: { regionId: ksaId } });

    // Book a single Fri (working in UAE, weekend in KSA).
    const submit = await submitLeave(employeeId, {
      leaveTypeId: typeId,
      mode: "DAY",
      startDate: FRI,
    });

    // In KSA, Friday is a weekend day — so 0 working days, 1 free day: request is not valid
    // (can't book a non-working day as leave). The engine rejects it, confirming new bookings
    // evaluate the NEW region. (If it somehow approved, workingDays would be 0.)
    // Either the submit fails with an error, or if it went through it must have workingDays=0.
    if (submit.ok) {
      const row = await db.leaveRequest.findUniqueOrThrow({
        where: { id: submit.id },
        select: { workingDays: true },
      });
      // If accepted (e.g. type has zero-day booking edge case), working days must be 0 in KSA.
      expect(row.workingDays).toBe(0);
    } else {
      // Normal path: engine correctly rejects booking on a KSA weekend.
      expect(submit.errors.length).toBeGreaterThan(0);
    }
  });
});

suite("backfillLeaveDayCounts (idempotent backfill, ADR-0015)", () => {
  // Isolated employees/types to avoid cross-test contamination.
  const BF_PREFIX = "dcs-bf-";
  const BF_CODE = "DCSBF";
  let bfEmpId = "";
  let bfTypeId = "";
  let bfPeriodId = "";

  beforeAll(async () => {
    uaeId = (await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } })).id;

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: BF_PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: BF_PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: BF_PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: BF_CODE } });

    bfTypeId = (await db.leaveType.create({
      data: { name: "DCS BF Vacation", code: BF_CODE, color: "#2F6FEB", deductsAllowance: true },
    })).id;

    bfEmpId = (await db.employee.create({
      data: {
        email: `${BF_PREFIX}emp@interestingtimes.me`,
        firstName: "Back",
        lastName: "Fill",
        regionId: uaeId,
        joiningDate: day("2024-01-01"),
        role: "STAFF",
      },
    })).id;

    bfPeriodId = (await db.allowancePeriod.create({
      data: { employeeId: bfEmpId, regionId: uaeId, startDate: day("2026-01-01"), opening: 10 },
    })).id;
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: BF_PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: BF_PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: BF_PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: BF_CODE } });
  });

  it("backfills a zero-row with correct day-counts and is idempotent", async () => {
    // Insert a PENDING row directly with workingDays=0 (simulates a legacy/import row).
    const req = await db.leaveRequest.create({
      data: {
        employeeId: bfEmpId,
        leaveTypeId: bfTypeId,
        startDate: day("2026-12-07"), // Mon
        endDate: day("2026-12-09"),   // Wed — Mon+Tue+Wed = 3 working days in UAE
        durationMode: "MULTI",
        workingDays: 0,
        freeDays: 0,
        allowanceDays: 0,
        status: "PENDING",
        allowancePeriodId: bfPeriodId,
        createdById: bfEmpId,
      },
    });

    // Run backfill — should fix the row.
    const count1 = await backfillLeaveDayCounts();
    expect(count1).toBeGreaterThanOrEqual(1); // at least our row was fixed

    const fixed = await db.leaveRequest.findUniqueOrThrow({
      where: { id: req.id },
      select: { workingDays: true, freeDays: true, allowanceDays: true },
    });
    expect(fixed.workingDays).toBe(3);  // Mon+Tue+Wed in UAE (weekend=Sat/Sun)
    expect(fixed.freeDays).toBe(0);
    expect(fixed.allowanceDays).toBe(3); // deductsAllowance=true

    // Run again — idempotent: the row has workingDays>0 so it is skipped.
    const count2 = await backfillLeaveDayCounts();
    expect(count2).toBe(0);

    // Row unchanged on second run.
    const unchanged = await db.leaveRequest.findUniqueOrThrow({
      where: { id: req.id },
      select: { workingDays: true, freeDays: true, allowanceDays: true },
    });
    expect(unchanged.workingDays).toBe(fixed.workingDays);
    expect(unchanged.freeDays).toBe(fixed.freeDays);
    expect(unchanged.allowanceDays).toBe(fixed.allowanceDays);

    // Cleanup.
    await db.leaveRequest.delete({ where: { id: req.id } });
  });

  it("does not touch a correctly-populated row", async () => {
    // Row with workingDays already set.
    const req = await db.leaveRequest.create({
      data: {
        employeeId: bfEmpId,
        leaveTypeId: bfTypeId,
        startDate: day("2026-12-14"), // Mon
        endDate: day("2026-12-14"),
        durationMode: "DAY",
        workingDays: 1,
        freeDays: 0,
        allowanceDays: 1,
        status: "PENDING",
        allowancePeriodId: bfPeriodId,
        createdById: bfEmpId,
      },
    });

    const count = await backfillLeaveDayCounts();
    expect(count).toBe(0); // nothing to fix

    const row = await db.leaveRequest.findUniqueOrThrow({
      where: { id: req.id },
      select: { workingDays: true, freeDays: true, allowanceDays: true },
    });
    expect(row.workingDays).toBe(1);
    expect(row.freeDays).toBe(0);
    expect(row.allowanceDays).toBe(1);

    await db.leaveRequest.delete({ where: { id: req.id } });
  });
});
