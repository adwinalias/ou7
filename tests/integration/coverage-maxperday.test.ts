// Integration tests for story 28.2 — department maxLeavePerDay (ADR-0014).
// Advisory only: warnings appear in preview and are audited on approval, but never block.
// Three new cases:
//   1. maxLeavePerDay=2, 2 others already off → warning; still ok=true.
//   2. maxLeavePerDay=null (minStaffing also null) → no check, no warning.
//   3. ONLY maxLeavePerDay set (minStaffing null) → check runs (proves short-circuit fix).
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
if (!dbUp) console.warn("[coverage-maxperday.integration] DATABASE_URL unreachable — skipping integration suite.");

const PREFIX = "cov282-";
const TYPE_CODE = "ITCOV2";

let uaeId = "";
let deptId = "";
let typeId = "";

// 4-person dept: empA = requester, empB+empC can be off, hrId not in dept.
let empAId = "";
let empBId = "";
let empCId = "";
let hrId = "";

// FUTURE Mon–Fri. UAE weekend = Sat(6)+Sun(0). 2027-04-07 = Wednesday.
const WED = "2027-04-07";
const THU = "2027-04-08";
const FRI = "2027-04-09";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function hrActor(id: string): Actor {
  return { employeeId: id, role: "HR", approverLevel: "APPROVER_ADD_EDIT", status: "ACTIVE", approverForIds: [] };
}

suite("Coverage enforcement — department maxLeavePerDay (story 28.2)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });
    uaeId = uae.id;

    // Clean previous fixtures.
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE_CODE } });
    await db.department.deleteMany({ where: { name: `${PREFIX}dept` } });

    // Dept: maxLeavePerDay=2, minStaffing=null initially.
    const dept = await db.department.create({ data: { name: `${PREFIX}dept`, minStaffing: null, maxLeavePerDay: 2 } });
    deptId = dept.id;

    typeId = (
      await db.leaveType.create({
        data: {
          name: "Cov2 Test Leave",
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
          lastName: "Cov2",
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
    hrId = (
      await mk("hr", { role: "HR", approverLevel: "APPROVER_ADD_EDIT", departmentId: null })
    ).id;
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId: { in: [empAId, empBId, empCId] } } });
    // Restore maxLeavePerDay=2 between tests that mutate it.
    await db.department.update({ where: { id: deptId }, data: { minStaffing: null, maxLeavePerDay: 2 } });
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE_CODE } });
    await db.department.deleteMany({ where: { name: `${PREFIX}dept` } });
    await db.$disconnect();
  });

  it("no warning when booking stays within maxLeavePerDay", async () => {
    // empB already off WED; only 1 off before empA → total would be 2 which equals limit → no breach.
    await db.leaveRequest.create({
      data: {
        employeeId: empBId, leaveTypeId: typeId,
        startDate: day(WED), endDate: day(WED), durationMode: "DAY",
        workingDays: 1, allowanceDays: 0, status: "APPROVED", createdById: empBId,
      },
    });
    const result = await previewLeave(empAId, { leaveTypeId: typeId, mode: "DAY", startDate: WED });
    expect(result.warnings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("produces a max-leave-per-day warning when booking exceeds the limit", async () => {
    // empB + empC both approved off WED → total would be 3 > maxLeavePerDay(2) → warning.
    for (const id of [empBId, empCId]) {
      await db.leaveRequest.create({
        data: {
          employeeId: id, leaveTypeId: typeId,
          startDate: day(WED), endDate: day(WED), durationMode: "DAY",
          workingDays: 1, allowanceDays: 0, status: "APPROVED", createdById: id,
        },
      });
    }
    const result = await previewLeave(empAId, { leaveTypeId: typeId, mode: "DAY", startDate: WED });
    expect(result.ok).toBe(true); // advisory — never blocks
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /maximum/i.test(w))).toBe(true);
  });

  it("advisory: approval still succeeds and records breach in audit", async () => {
    for (const id of [empBId, empCId]) {
      await db.leaveRequest.create({
        data: {
          employeeId: id, leaveTypeId: typeId,
          startDate: day(WED), endDate: day(WED), durationMode: "DAY",
          workingDays: 1, allowanceDays: 0, status: "APPROVED", createdById: id,
        },
      });
    }
    const req = await db.leaveRequest.create({
      data: {
        employeeId: empAId, leaveTypeId: typeId,
        startDate: day(WED), endDate: day(WED), durationMode: "DAY",
        workingDays: 1, allowanceDays: 0, status: "PENDING", createdById: empAId,
      },
      select: { id: true },
    });

    const decision = await decideLeaveRequest(hrActor(hrId), req.id, "APPROVE");
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;

    expect(decision.warnings).toBeDefined();
    expect(decision.warnings!.length).toBeGreaterThan(0);
    expect(decision.warnings!.some((w) => /maximum/i.test(w))).toBe(true);

    const audit = await db.auditEvent.findFirst({
      where: { entity: "LeaveRequest", entityId: req.id, action: "LEAVE_APPROVE" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    const after = audit!.after as Record<string, unknown>;
    expect(after.coverageBreach).toBeDefined();
    expect(String(after.coverageBreach)).toMatch(/maximum/i);
  });

  it("no warning when maxLeavePerDay is null (both thresholds null)", async () => {
    // Remove both thresholds → short-circuit skips check entirely.
    await db.department.update({ where: { id: deptId }, data: { minStaffing: null, maxLeavePerDay: null } });

    // empB + empC off WED — but no check configured → no warning.
    for (const id of [empBId, empCId]) {
      await db.leaveRequest.create({
        data: {
          employeeId: id, leaveTypeId: typeId,
          startDate: day(WED), endDate: day(WED), durationMode: "DAY",
          workingDays: 1, allowanceDays: 0, status: "APPROVED", createdById: id,
        },
      });
    }
    const result = await previewLeave(empAId, { leaveTypeId: typeId, mode: "DAY", startDate: WED });
    expect(result.warnings).toEqual([]);
  });

  it("only maxLeavePerDay set (minStaffing null) — check still runs (proves short-circuit fix)", async () => {
    // Dept already has maxLeavePerDay=2, minStaffing=null (restored in beforeEach).
    // empB + empC off WED → total would be 3 > 2 → warning despite minStaffing being null.
    for (const id of [empBId, empCId]) {
      await db.leaveRequest.create({
        data: {
          employeeId: id, leaveTypeId: typeId,
          startDate: day(WED), endDate: day(WED), durationMode: "DAY",
          workingDays: 1, allowanceDays: 0, status: "APPROVED", createdById: id,
        },
      });
    }
    const result = await previewLeave(empAId, { leaveTypeId: typeId, mode: "DAY", startDate: WED });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /maximum/i.test(w))).toBe(true);
  });

  it("coverageSlots returned when maxLeavePerDay is set", async () => {
    const result = await previewLeave(empAId, { leaveTypeId: typeId, mode: "DAY", startDate: WED });
    expect(result.coverageSlots).toBeDefined();
    expect(result.coverageSlots!.maxLeavePerDay).toBe(2);
    // 0 others off → remaining = maxLeavePerDay − 0 − 1 (requester) = 1
    const wedDay = result.coverageSlots!.perDayRemaining.find((d) => d.date === WED);
    expect(wedDay).toBeDefined();
    expect(wedDay!.remaining).toBe(1);
  });

  it("coverageSlots not returned when maxLeavePerDay is null", async () => {
    await db.department.update({ where: { id: deptId }, data: { maxLeavePerDay: null } });
    const result = await previewLeave(empAId, { leaveTypeId: typeId, mode: "DAY", startDate: WED });
    expect(result.coverageSlots).toBeUndefined();
  });

  it("multi-day range: warning on tightest day, slots per working day", async () => {
    // empB approved WED–FRI; empC approved on WED only.
    // WED: 2 others off → total 3 > 2 → breach.
    // THU + FRI: 1 other off (empB) → total 2 = limit → no breach on those days.
    await db.leaveRequest.create({
      data: {
        employeeId: empBId, leaveTypeId: typeId,
        startDate: day(WED), endDate: day(FRI), durationMode: "MULTI",
        workingDays: 3, allowanceDays: 0, status: "APPROVED", createdById: empBId,
      },
    });
    await db.leaveRequest.create({
      data: {
        employeeId: empCId, leaveTypeId: typeId,
        startDate: day(WED), endDate: day(WED), durationMode: "DAY",
        workingDays: 1, allowanceDays: 0, status: "APPROVED", createdById: empCId,
      },
    });

    const result = await previewLeave(empAId, { leaveTypeId: typeId, mode: "MULTI", startDate: WED, endDate: FRI });
    expect(result.warnings.length).toBeGreaterThan(0); // at least WED breaches
    expect(result.coverageSlots).toBeDefined();
    expect(result.coverageSlots!.perDayRemaining.length).toBe(3); // WED, THU, FRI
    const wedSlots = result.coverageSlots!.perDayRemaining.find((d) => d.date === WED);
    expect(wedSlots).toBeDefined();
    // WED: 2 others off → remaining = 2 − 2 − 1 = −1 (over limit)
    expect(wedSlots!.remaining).toBe(-1);
  });

  it("both minStaffing AND maxLeavePerDay breach on same approval — audit records BOTH warnings (ADR-0014)", async () => {
    // Dept: 3 active members (empA+empB+empC). Set both thresholds:
    //   minStaffing=2  → need ≥2 present; empB already off → only empC remains (1 < 2) → breach.
    //   maxLeavePerDay=1 → max 1 off; empB already off → total would be 2 > 1 → breach.
    await db.department.update({ where: { id: deptId }, data: { minStaffing: 2, maxLeavePerDay: 1 } });

    // empB approved off WED.
    await db.leaveRequest.create({
      data: {
        employeeId: empBId, leaveTypeId: typeId,
        startDate: day(WED), endDate: day(WED), durationMode: "DAY",
        workingDays: 1, allowanceDays: 0, status: "APPROVED", createdById: empBId,
      },
    });

    // empA submits PENDING for WED.
    const req = await db.leaveRequest.create({
      data: {
        employeeId: empAId, leaveTypeId: typeId,
        startDate: day(WED), endDate: day(WED), durationMode: "DAY",
        workingDays: 1, allowanceDays: 0, status: "PENDING", createdById: empAId,
      },
      select: { id: true },
    });

    const decision = await decideLeaveRequest(hrActor(hrId), req.id, "APPROVE");
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;

    // Both warnings returned to caller.
    expect(decision.warnings!.length).toBe(2);

    // Audit entry must carry BOTH breach strings, not just the first (the bug under test).
    const audit = await db.auditEvent.findFirst({
      where: { entity: "LeaveRequest", entityId: req.id, action: "LEAVE_APPROVE" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    const after = audit!.after as Record<string, unknown>;
    const breachField = after.coverageBreach;
    expect(Array.isArray(breachField)).toBe(true);
    const breachArr = breachField as string[];
    expect(breachArr.some((w) => /minimum staffing/i.test(w))).toBe(true);
    expect(breachArr.some((w) => /maximum/i.test(w))).toBe(true);
  });
});
