// Integration tests for the audit log (Epic 16.1): recordAudit writes events, the
// approve/decline path emits one atomically, and getAuditEvents reads them back.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAuditEvents, recordAudit } from "@/lib/audit";
import { decideLeaveRequest } from "@/lib/approvals";
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
if (!dbUp) console.warn("[audit.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "audit-it-";
const TYPE = "AUDV";
let requesterId = "";
let approverId = "";
let periodId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function actor(over: Partial<Actor> & Pick<Actor, "employeeId" | "role">): Actor {
  return { approverLevel: "NONE", status: "ACTIVE", approverForIds: [], ...over };
}

suite("Audit log (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });

    const type = await db.leaveType.create({ data: { name: "Audit Vacation", code: TYPE, color: "#2F6FEB", deductsAllowance: true } });
    requesterId = (await db.employee.create({ data: { email: `${PREFIX}req@interestingtimes.me`, firstName: "Req", lastName: "Audit", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    approverId = (await db.employee.create({ data: { email: `${PREFIX}appr@interestingtimes.me`, firstName: "Appr", lastName: "Audit", regionId: uae.id, joiningDate: day("2024-01-01"), role: "APPROVER", approverLevel: "APPROVER" } })).id;
    await db.approverAssignment.create({ data: { employeeId: requesterId, approverId } });
    periodId = (await db.allowancePeriod.create({ data: { employeeId: requesterId, regionId: uae.id, startDate: day("2026-01-01"), opening: 10 } })).id;
    void type;
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { OR: [{ actorId: approverId }, { entityId: { startsWith: PREFIX } }] } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.$disconnect();
  });

  it("recordAudit writes an event readable via getAuditEvents", async () => {
    const entityId = `${PREFIX}entity-1`;
    await recordAudit(db, { actorId: approverId, action: "TEST_ACTION", entity: "TestEntity", entityId, before: { a: 1 }, after: { a: 2 } });
    const { rows } = await getAuditEvents({ entity: "TestEntity", entityId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "TEST_ACTION", entity: "TestEntity", entityId });
    expect(rows[0]!.before).toEqual({ a: 1 });
    expect(rows[0]!.after).toEqual({ a: 2 });
    expect(rows[0]!.actorName).toBe("Appr Audit");
  });

  it("approving a request emits an immutable before→after audit event", async () => {
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: (await db.leaveType.findFirstOrThrow({ where: { code: TYPE } })).id, startDate: day("2026-03-02"), endDate: day("2026-03-02"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", allowancePeriodId: periodId, createdById: requesterId },
    });

    const res = await decideLeaveRequest(actor({ employeeId: approverId, role: "APPROVER", approverLevel: "APPROVER", approverForIds: [requesterId] }), req.id, "APPROVE", "ok");
    expect(res.ok).toBe(true);

    const { rows } = await getAuditEvents({ entity: "LeaveRequest", entityId: req.id });
    expect(rows).toHaveLength(1);
    const e = rows[0]!;
    expect(e.action).toBe("LEAVE_APPROVE");
    expect(e.actorName).toBe("Appr Audit");
    expect(e.before).toEqual({ status: "PENDING" });
    expect((e.after as { status: string }).status).toBe("APPROVED");
  });
});
