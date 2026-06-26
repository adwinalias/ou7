// Integration tests for story 28.1 — department minimum staffing (ADR-0014).
// Advisory only: coverage warnings appear in preview and are recorded on the
// LEAVE_APPROVE audit entry, but approval is never blocked.
// Uses real seeded Employees in a department with minStaffing set. FUTURE dates only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decideLeaveRequest } from "@/lib/approvals";
import { db } from "@/lib/db";
import { previewLeave } from "@/lib/leave";
import type { Actor } from "@/core/types";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[coverage.integration] DATABASE_URL unreachable — skipping integration suite.");

const PREFIX = "cov28-";
const TYPE_CODE = "ITCOV";

let uaeId = "";
let deptId = "";
let typeId = "";

// 3-person department, minStaffing=2 → need ≥2 present each day.
let empAId = "";  // the requester
let empBId = "";  // second active dept member (may already be off)
let empCId = "";  // third active dept member
let hrId = "";

// FUTURE Mon–Fri that avoids existing fixtures
// UAE weekend = Sat(6)+Sun(0). Pick working days starting Mon 2027-03-01.
const MON = "2027-03-01"; // Monday
const TUE = "2027-03-02";
const WED = "2027-03-03";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function hrActor(id: string): Actor {
  return { employeeId: id, role: "HR", approverLevel: "APPROVER_ADD_EDIT", status: "ACTIVE", approverForIds: [] };
}

async function createPending(employeeId: string, startISO: string, endISO: string, mode: "DAY" | "MULTI" = "DAY") {
  return db.leaveRequest.create({
    data: {
      employeeId,
      leaveTypeId: typeId,
      startDate: day(startISO),
      endDate: day(endISO),
      durationMode: mode,
      workingDays: mode === "DAY" ? 1 : 3,
      allowanceDays: 0,
      status: "PENDING",
      createdById: employeeId,
    },
    select: { id: true },
  });
}

suite("Coverage enforcement — department min staffing (story 28.1)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] }, // Sat(6)+Sun(0)
    });
    uaeId = uae.id;

    // Clean up any leftover fixtures from prior runs.
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE_CODE } });
    await db.department.deleteMany({ where: { name: `${PREFIX}dept` } });

    // Department with minStaffing=2 (need 2 present out of 3 active members).
    const dept = await db.department.create({ data: { name: `${PREFIX}dept`, minStaffing: 2 } });
    deptId = dept.id;

    typeId = (
      await db.leaveType.create({
        data: {
          name: "Cov Test Leave",
          code: TYPE_CODE,
          color: "#2F6FEB",
          deductsAllowance: false,
          requiresApproval: true,
        },
      })
    ).id;

    const mk = (key: string, over: Record<string, unknown> = {}) =>
      db.employee.create({
        data: {
          email: `${PREFIX}${key}@interestingtimes.me`,
          firstName: key,
          lastName: "Cov",
          regionId: uaeId,
          departmentId: deptId,
          joiningDate: day("2024-01-01"),
          status: "ACTIVE",
          role: "STAFF",
          ...over,
        },
        select: { id: true },
      });

    empAId = (await mk("empA")).id;
    empBId = (await mk("empB")).id;
    empCId = (await mk("empC")).id;
    hrId = (await mk("hr", { role: "HR", approverLevel: "APPROVER_ADD_EDIT", departmentId: null })).id;

    // Give HR employee null department so it doesn't inflate headcount.
    await db.employee.update({ where: { id: hrId }, data: { departmentId: null } });
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({
      where: { employeeId: { in: [empAId, empBId, empCId] } },
    });
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE_CODE } });
    await db.department.deleteMany({ where: { name: `${PREFIX}dept` } });
    await db.$disconnect();
  });

  it("no warning when booking keeps present headcount at or above minStaffing", async () => {
    // Nobody else is off → empA books Mon alone → 3 members − 1 (requester) = 2 present ≥ minStaffing(2) → no breach.
    const result = await previewLeave(empAId, {
      leaveTypeId: typeId,
      mode: "DAY",
      startDate: MON,
    });
    expect(result.warnings).toEqual([]);
  });

  it("produces a coverage warning when booking drops present below minStaffing", async () => {
    // empB already has approved leave on MON → only empC remains (1 present) < minStaffing(2).
    await db.leaveRequest.create({
      data: {
        employeeId: empBId,
        leaveTypeId: typeId,
        startDate: day(MON),
        endDate: day(MON),
        durationMode: "DAY",
        workingDays: 1,
        allowanceDays: 0,
        status: "APPROVED",
        createdById: empBId,
      },
    });

    const result = await previewLeave(empAId, {
      leaveTypeId: typeId,
      mode: "DAY",
      startDate: MON,
    });

    // Advisory: ok=true (not blocked), but warnings includes the breach message.
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/minimum staffing/i);
  });

  it("still allows submitting when coverage breach exists (advisory only)", async () => {
    // Same scenario — empB is off MON, empA requests MON.
    await db.leaveRequest.create({
      data: {
        employeeId: empBId,
        leaveTypeId: typeId,
        startDate: day(MON),
        endDate: day(MON),
        durationMode: "DAY",
        workingDays: 1,
        allowanceDays: 0,
        status: "APPROVED",
        createdById: empBId,
      },
    });

    const result = await previewLeave(empAId, {
      leaveTypeId: typeId,
      mode: "DAY",
      startDate: MON,
    });
    // ok=true: the user CAN submit despite the warning.
    expect(result.ok).toBe(true);
  });

  it("approving a coverage-breaching request SUCCEEDS and records the breach in the audit", async () => {
    // empB is approved off MON, empA submits PENDING for MON → breach on approval.
    await db.leaveRequest.create({
      data: {
        employeeId: empBId,
        leaveTypeId: typeId,
        startDate: day(MON),
        endDate: day(MON),
        durationMode: "DAY",
        workingDays: 1,
        allowanceDays: 0,
        status: "APPROVED",
        createdById: empBId,
      },
    });

    const req = await createPending(empAId, MON, MON);

    const decision = await decideLeaveRequest(hrActor(hrId), req.id, "APPROVE");
    expect(decision.ok).toBe(true);
    if (!decision.ok) return; // type narrowing

    // Advisory warning returned to caller.
    expect(decision.warnings).toBeDefined();
    expect(decision.warnings!.length).toBeGreaterThan(0);
    expect(decision.warnings![0]).toMatch(/minimum staffing/i);

    // Audit entry has coverageBreach recorded.
    const audit = await db.auditEvent.findFirst({
      where: { entity: "LeaveRequest", entityId: req.id, action: "LEAVE_APPROVE" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    const after = audit!.after as Record<string, unknown>;
    expect(after.coverageBreach).toBeDefined();
    expect(String(after.coverageBreach)).toMatch(/minimum staffing/i);
  });

  it("no warning when minStaffing is null (no check configured)", async () => {
    // Temporarily remove minStaffing from dept.
    await db.department.update({ where: { id: deptId }, data: { minStaffing: null } });
    try {
      // Even with empB + empC off, no warning because minStaffing is null.
      await db.leaveRequest.create({
        data: {
          employeeId: empBId,
          leaveTypeId: typeId,
          startDate: day(MON),
          endDate: day(MON),
          durationMode: "DAY",
          workingDays: 1,
          allowanceDays: 0,
          status: "APPROVED",
          createdById: empBId,
        },
      });
      const result = await previewLeave(empAId, {
        leaveTypeId: typeId,
        mode: "DAY",
        startDate: MON,
      });
      expect(result.warnings).toEqual([]);
    } finally {
      // Restore for other tests.
      await db.department.update({ where: { id: deptId }, data: { minStaffing: 2 } });
    }
  });

  it("no warning when the employee has no department", async () => {
    // empA with no department → no check.
    await db.employee.update({ where: { id: empAId }, data: { departmentId: null } });
    try {
      const result = await previewLeave(empAId, {
        leaveTypeId: typeId,
        mode: "DAY",
        startDate: MON,
      });
      expect(result.warnings).toEqual([]);
    } finally {
      await db.employee.update({ where: { id: empAId }, data: { departmentId: deptId } });
    }
  });

  it("PENDING leave by a dept member also counts toward coverage", async () => {
    // empB has PENDING leave on MON — still counts as absent per ADR-0014.
    await createPending(empBId, MON, MON);

    const result = await previewLeave(empAId, {
      leaveTypeId: typeId,
      mode: "DAY",
      startDate: MON,
    });
    // 3 members − 1 (empB pending) − 1 (empA requesting) = 1 < minStaffing(2) → warning.
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/minimum staffing/i);
  });
});
