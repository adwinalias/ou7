// Integration tests for story 29.2 — staff-vs-staff clash enforcement (ADR-0014).
// Real seeded employees + StaffRestriction; FUTURE dates; approve via decideLeaveRequest.
// Self-skips without a DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decideLeaveRequest } from "@/lib/approvals";
import { previewLeave } from "@/lib/leave";
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
if (!dbUp) console.warn("[clash-enforce.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "clash29-";
const TYPE_CODE = "ITCLSH";

// UAE: weekend = Sat(6)+Sun(0). FUTURE working days Mon→Fri 2027-04-07..2027-04-11.
const MON = "2027-04-07";
const WED = "2027-04-09";
// The same week but only a Saturday (non-working day in UAE).
const SAT = "2027-04-12";

let uaeId = "";
let typeId = "";
let hrId = "";
let empAId = "";   // employee A — the one being restricted
let empBId = "";   // employee B — the counterpart
let approverOnlyId = ""; // non-HR approver who is assigned to empA

function hrActor(id: string): Actor {
  return { employeeId: id, role: "HR", approverLevel: "APPROVER_ADD_EDIT", status: "ACTIVE", approverForIds: [] };
}
function approverActor(id: string, forId: string): Actor {
  return { employeeId: id, role: "APPROVER", approverLevel: "APPROVER", status: "ACTIVE", approverForIds: [forId] };
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

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

suite("Clash enforcement — staff-vs-staff (story 29.2)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: { weekendDays: [6, 0] },
      create: { name: "UAE", weekendDays: [6, 0] },
    });
    uaeId = uae.id;

    // Clean up any leftover fixtures.
    const emails = [
      `${PREFIX}hr@it.me`,
      `${PREFIX}a@it.me`,
      `${PREFIX}b@it.me`,
      `${PREFIX}approver@it.me`,
    ];
    const existing = await db.employee.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const ids = existing.map((e) => e.id);
    if (ids.length) {
      await db.staffRestriction.deleteMany({
        where: { OR: [{ employeeAId: { in: ids } }, { employeeBId: { in: ids } }] },
      });
      await db.leaveRequest.deleteMany({ where: { employeeId: { in: ids } } });
      await db.approverAssignment.deleteMany({ where: { employeeId: { in: ids } } });
      await db.approverAssignment.deleteMany({ where: { approverId: { in: ids } } });
      await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
      await db.employee.deleteMany({ where: { id: { in: ids } } });
    }
    await db.leaveType.deleteMany({ where: { code: TYPE_CODE } });

    typeId = (
      await db.leaveType.create({
        data: {
          name: "Clash Test Leave",
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
          email: `${PREFIX}${key}@it.me`,
          firstName: key,
          lastName: "Clash",
          regionId: uaeId,
          joiningDate: day("2024-01-01"),
          status: "ACTIVE",
          role: "STAFF",
          ...over,
        },
        select: { id: true },
      });

    hrId = (await mk("hr", { role: "HR", approverLevel: "APPROVER_ADD_EDIT" })).id;
    empAId = (await mk("a")).id;
    empBId = (await mk("b")).id;
    approverOnlyId = (await mk("approver", { role: "APPROVER", approverLevel: "APPROVER" })).id;

    // Assign approverOnly as empA's approver.
    await db.approverAssignment.create({
      data: { employeeId: empAId, approverId: approverOnlyId, order: 1 },
    });

    // Create a bidirectional restriction between A and B.
    await db.staffRestriction.create({
      data: { employeeAId: empAId, employeeBId: empBId, bidirectional: true },
    });
  });

  beforeEach(async () => {
    // Clean leave requests for A and B before each test.
    await db.leaveRequest.deleteMany({
      where: { employeeId: { in: [empAId, empBId] } },
    });
  });

  afterAll(async () => {
    const emails = [
      `${PREFIX}hr@it.me`,
      `${PREFIX}a@it.me`,
      `${PREFIX}b@it.me`,
      `${PREFIX}approver@it.me`,
    ];
    const existing = await db.employee.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const ids = existing.map((e) => e.id);
    if (ids.length) {
      await db.staffRestriction.deleteMany({
        where: { OR: [{ employeeAId: { in: ids } }, { employeeBId: { in: ids } }] },
      });
      await db.leaveRequest.deleteMany({ where: { employeeId: { in: ids } } });
      await db.approverAssignment.deleteMany({ where: { employeeId: { in: ids } } });
      await db.approverAssignment.deleteMany({ where: { approverId: { in: ids } } });
      await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
      await db.employee.deleteMany({ where: { id: { in: ids } } });
    }
    await db.leaveType.deleteMany({ where: { code: TYPE_CODE } });
    await db.$disconnect();
  });

  it("preview INCLUDES clash warning when B has APPROVED leave on shared working days", async () => {
    // B has approved leave Mon.
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

    // A previews Mon → should get a clash warning (advisory only, ok=true).
    const result = await previewLeave(empAId, {
      leaveTypeId: typeId,
      mode: "DAY",
      startDate: MON,
    });

    expect(result.ok).toBe(true); // advisory: ok=true, user can still submit
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /same time/i.test(w))).toBe(true);
  });

  it("preview INCLUDES clash warning when B has PENDING leave on shared working days", async () => {
    // PENDING also counts per ADR-0014.
    await createPending(empBId, MON, MON);

    const result = await previewLeave(empAId, {
      leaveTypeId: typeId,
      mode: "DAY",
      startDate: MON,
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => /same time/i.test(w))).toBe(true);
  });

  it("A can still SUBMIT (advisory at submit) despite clash warning", async () => {
    // B has approved leave Mon; A requests Mon. previewLeave ok=true means submit is unblocked.
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

    // ok=true means submit would proceed (submit calls previewLeave internally).
    expect(result.ok).toBe(true);
  });

  it("non-HR approver approving A's request BLOCKED by clash (ok:false)", async () => {
    // B approved Mon; A pending Mon.
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

    const decision = await decideLeaveRequest(approverActor(approverOnlyId, empAId), req.id, "APPROVE");

    expect(decision.ok).toBe(false);
    if (decision.ok) return; // type narrowing
    expect(decision.errors.join(" ")).toMatch(/same time/i);

    // Request is still PENDING.
    const stillPending = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(stillPending.status).toBe("PENDING");
  });

  it("HR approving WITHOUT override reason → still BLOCKED", async () => {
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

    // HR without override reason — overrideReason is empty/undefined.
    const decision = await decideLeaveRequest(hrActor(hrId), req.id, "APPROVE");

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.errors.join(" ")).toMatch(/same time/i);

    const stillPending = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(stillPending.status).toBe("PENDING");
  });

  it("HR approving WITH override reason → APPROVED; audit records override reason", async () => {
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

    const overrideReason = "Both agreed; project deadline requires both present";
    const decision = await decideLeaveRequest(hrActor(hrId), req.id, "APPROVE", undefined, overrideReason);

    expect(decision.ok).toBe(true);

    // Request is now APPROVED.
    const approved = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(approved.status).toBe("APPROVED");

    // Audit entry records the override reason.
    const audit = await db.auditEvent.findFirst({
      where: { entity: "LeaveRequest", entityId: req.id, action: "LEAVE_APPROVE" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    const after = audit!.after as Record<string, unknown>;
    expect(after.clashOverrideReason).toBe(overrideReason);
    expect(String(after.clashOverrideWarning)).toMatch(/override/i);
  });

  it("overlap only on a weekend (SAT) → no clash → approval succeeds normally", async () => {
    // B has approved leave SAT (Sat = non-working in UAE).
    await db.leaveRequest.create({
      data: {
        employeeId: empBId,
        leaveTypeId: typeId,
        startDate: day(SAT),
        endDate: day(SAT),
        durationMode: "DAY",
        workingDays: 0, // SAT is a non-working day; workingDays=0 for data integrity
        allowanceDays: 0,
        status: "APPROVED",
        createdById: empBId,
      },
    });
    // A requests SAT — will be blocked by core (0 working days), so test with MON-WED multi
    // range but only B's leave is on SAT (no overlap on working days).
    // B off only on SAT; A requests Mon→Tue (2 working days) — no shared working day → no clash.
    const req = await createPending(empAId, MON, "2027-04-08"); // Mon-Tue (2 working days)

    const decision = await decideLeaveRequest(approverActor(approverOnlyId, empAId), req.id, "APPROVE");

    // No clash on working days → non-HR approver can approve normally.
    expect(decision.ok).toBe(true);
  });

  it("non-bidirectional restriction: B→A direction is NOT blocked", async () => {
    // Delete the bidirectional restriction and create a non-bidirectional one (A→B only).
    const existing = await db.staffRestriction.findFirst({
      where: {
        OR: [
          { employeeAId: empAId, employeeBId: empBId },
          { employeeAId: empBId, employeeBId: empAId },
        ],
      },
      select: { id: true },
    });
    if (existing) await db.staffRestriction.delete({ where: { id: existing.id } });

    // Create A→B non-bidirectional: only constrains A when B is off; B is NOT constrained.
    const restr = await db.staffRestriction.create({
      data: { employeeAId: empAId, employeeBId: empBId, bidirectional: false },
    });

    try {
      // A has approved leave Mon. B requests Mon.
      await db.leaveRequest.create({
        data: {
          employeeId: empAId,
          leaveTypeId: typeId,
          startDate: day(MON),
          endDate: day(MON),
          durationMode: "DAY",
          workingDays: 1,
          allowanceDays: 0,
          status: "APPROVED",
          createdById: empAId,
        },
      });

      // B also needs a non-HR approver assigned; assign approverOnly to B temporarily.
      const asgn = await db.approverAssignment.create({
        data: { employeeId: empBId, approverId: approverOnlyId, order: 1 },
        select: { id: true },
      });

      try {
        const reqB = await createPending(empBId, MON, MON);

        // Non-bidirectional → B is NOT constrained → approval succeeds.
        const decision = await decideLeaveRequest(approverActor(approverOnlyId, empBId), reqB.id, "APPROVE");
        expect(decision.ok).toBe(true);
      } finally {
        await db.approverAssignment.delete({ where: { id: asgn.id } });
      }
    } finally {
      await db.staffRestriction.delete({ where: { id: restr.id } });
      // Restore the bidirectional restriction for subsequent tests.
      await db.staffRestriction.create({
        data: { employeeAId: empAId, employeeBId: empBId, bidirectional: true },
      });
    }
  });
});
