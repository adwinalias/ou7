// Integration tests for the approval workflow (Epic 5.4) against a real Postgres:
// queue scoping, RBAC-guarded decisions, approve→debit, decline+reason, and the
// over-booking re-check at approval. Self-skips when the DB is unreachable.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decideLeaveRequest, listPendingForApprover } from "@/lib/approvals";
import { getOpenPeriodBalance } from "@/lib/allowance";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/rbac";
import type { Actor } from "@/core/types";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[approvals.integration] DATABASE_URL unreachable — skipping integration suite.");

const PREFIX = "appr-it-";
const TYPE = "ITAV";

let typeId = "";
let requesterId = "";
let requester2Id = "";
let approverId = "";
let hrId = "";
let otherId = "";
let period5 = "";
let period1 = "";

function actor(over: Partial<Actor> & Pick<Actor, "employeeId" | "role">): Actor {
  return { approverLevel: "NONE", status: "ACTIVE", approverForIds: [], ...over };
}
let approverActor: Actor;
let hrActor: Actor;
let staffActor: Actor;

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function pending(employeeId: string, opts: { periodId?: string; days?: number; start?: string } = {}) {
  const days = opts.days ?? 1;
  const start = opts.start ?? "2026-03-02";
  return db.leaveRequest.create({
    data: {
      employeeId,
      leaveTypeId: typeId,
      startDate: day(start),
      endDate: day(start),
      durationMode: "DAY",
      workingDays: days,
      allowanceDays: days,
      status: "PENDING",
      allowancePeriodId: opts.periodId ?? null,
      createdById: employeeId,
    },
  });
}

suite("Approval workflow (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });

    typeId = (await db.leaveType.create({ data: { name: "IT Approve Vacation", code: TYPE, color: "#2F6FEB", deductsAllowance: true } })).id;

    const mk = (key: string, over: Record<string, unknown> = {}) =>
      db.employee.create({
        data: {
          email: `${PREFIX}${key}@interestingtimes.me`,
          firstName: key,
          lastName: "T",
          regionId: uae.id,
          joiningDate: day("2024-01-01"),
          role: "STAFF",
          ...over,
        },
      });

    requesterId = (await mk("requester")).id;
    requester2Id = (await mk("requester2")).id;
    approverId = (await mk("approver", { role: "APPROVER", approverLevel: "APPROVER" })).id;
    hrId = (await mk("hr", { role: "HR", approverLevel: "APPROVER_ADD_EDIT" })).id;
    otherId = (await mk("other")).id;

    await db.approverAssignment.create({ data: { employeeId: requesterId, approverId } });

    period5 = (await db.allowancePeriod.create({ data: { employeeId: requesterId, regionId: uae.id, startDate: day("2026-01-01"), opening: 5 } })).id;
    period1 = (await db.allowancePeriod.create({ data: { employeeId: requester2Id, regionId: uae.id, startDate: day("2026-01-01"), opening: 1 } })).id;

    approverActor = actor({ employeeId: approverId, role: "APPROVER", approverLevel: "APPROVER", approverForIds: [requesterId] });
    hrActor = actor({ employeeId: hrId, role: "HR", approverLevel: "APPROVER_ADD_EDIT" });
    staffActor = actor({ employeeId: otherId, role: "STAFF" });
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId: { in: [requesterId, requester2Id, approverId, hrId, otherId] } } });
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.$disconnect();
  });

  it("scopes the queue: approver sees only assigned, never own; HR sees all", async () => {
    await pending(requesterId, { periodId: period5 });
    await pending(otherId);
    await pending(approverId); // approver's own — must never appear for them

    const forApprover = await listPendingForApprover(approverActor);
    expect(forApprover.map((r) => r.requesterName)).toEqual(["requester T"]);

    const forHr = await listPendingForApprover(hrActor);
    const names = forHr.map((r) => r.requesterName).sort();
    expect(names).toContain("requester T");
    expect(names).toContain("other T");
    expect(names).toContain("approver T");
  });

  it("approve → APPROVED and debits the allowance via the engine", async () => {
    const req = await pending(requesterId, { periodId: period5, days: 2 });

    const res = await decideLeaveRequest(approverActor, req.id, "APPROVE", "Enjoy");
    expect(res.ok).toBe(true);

    const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(row.status).toBe("APPROVED");
    expect(row.decisionById).toBe(approverId);
    expect(row.decisionAt).not.toBeNull();

    const bal = await getOpenPeriodBalance(requesterId);
    expect(bal?.takenApproved).toBe(2);
    expect(bal?.pending).toBe(0);
    expect(bal?.available).toBe(3);
  });

  it("decline requires a reason, then records it", async () => {
    const req = await pending(requesterId, { periodId: period5 });

    const noReason = await decideLeaveRequest(approverActor, req.id, "DECLINE");
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.errors.join(" ")).toMatch(/reason is required/i);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");

    const declined = await decideLeaveRequest(approverActor, req.id, "DECLINE", "Short-staffed");
    expect(declined.ok).toBe(true);
    const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(row.status).toBe("DECLINED");
    expect(row.decisionComment).toBe("Short-staffed");
  });

  it("rejects unauthorized actors with 403", async () => {
    const req = await pending(requesterId, { periodId: period5 });

    for (const bad of [staffActor, { ...approverActor, employeeId: approverId, approverForIds: [] as string[] }]) {
      try {
        await decideLeaveRequest(bad, req.id, "APPROVE");
        throw new Error("expected AuthError");
      } catch (e) {
        expect(e).toBeInstanceOf(AuthError);
        expect((e as AuthError).status).toBe(403);
      }
    }
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
  });

  it("blocks approval that would over-commit the balance (HR-adjust message)", async () => {
    // opening 1, but a 2-day request slipped in (e.g. a later adjustment) — can't approve.
    const req = await pending(requester2Id, { periodId: period1, days: 2 });

    const res = await decideLeaveRequest(hrActor, req.id, "APPROVE");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/HR must adjust/i);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
  });
});
