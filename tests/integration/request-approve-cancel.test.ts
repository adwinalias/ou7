// Epic 22.5 — the key hot path end-to-end on the SERVER side, against a real Postgres:
// request (PENDING) → approve (decideLeaveRequest, allowance DEBITED via core/allowance) →
// cancel (cancelLeaveRequest, allowance RESTORED). This is the CI-covered server round-trip
// (the Playwright e2e of the same flow runs locally / is CI-ready). Self-skips without a DB,
// mirroring the other integration tests (unique email prefix + afterAll cleanup).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decideLeaveRequest } from "@/lib/approvals";
import { cancelLeaveRequest } from "@/lib/cancellation";
import { getOpenPeriodBalance } from "@/lib/allowance";
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
if (!dbUp) console.warn("[request-approve-cancel.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "rac-it-";
const TYPE = "RACV";
let requesterId = "";
let approverId = "";
let hrId = "";
let periodId = "";
let typeId = "";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const actor = (over: Partial<Actor> & Pick<Actor, "employeeId" | "role">): Actor => ({
  approverLevel: "NONE",
  status: "ACTIVE",
  approverForIds: [],
  ...over,
});
const approver = () =>
  actor({ employeeId: approverId, role: "APPROVER", approverLevel: "APPROVER", approverForIds: [requesterId] });
const hr = () => actor({ employeeId: hrId, role: "HR", approverLevel: "APPROVER_ADD_EDIT" });

/** Create a PENDING request for the requester in the open period (start in the future so it's
 *  cancellable). `allowanceDays`/`workingDays` are what the engine debits once APPROVED. */
async function pending(opts: { startISO: string; days?: number }) {
  const days = opts.days ?? 1;
  return db.leaveRequest.create({
    data: {
      employeeId: requesterId,
      leaveTypeId: typeId,
      startDate: day(opts.startISO),
      endDate: day(opts.startISO),
      durationMode: "DAY",
      workingDays: days,
      allowanceDays: days,
      status: "PENDING",
      allowancePeriodId: periodId,
      createdById: requesterId,
    },
  });
}

suite("Request → Approve → Cancel (integration, server round-trip)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });

    typeId = (await db.leaveType.create({ data: { name: "RAC Vacation", code: TYPE, color: "#2F6FEB", deductsAllowance: true } })).id;
    requesterId = (await db.employee.create({ data: { email: `${PREFIX}requester@interestingtimes.me`, firstName: "Req", lastName: "Ester", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    approverId = (await db.employee.create({ data: { email: `${PREFIX}approver@interestingtimes.me`, firstName: "App", lastName: "Rover", regionId: uae.id, joiningDate: day("2024-01-01"), role: "APPROVER", approverLevel: "APPROVER" } })).id;
    hrId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "H", lastName: "R", regionId: uae.id, joiningDate: day("2024-01-01"), role: "HR", approverLevel: "APPROVER_ADD_EDIT" } })).id;
    await db.approverAssignment.create({ data: { employeeId: requesterId, approverId } });
    periodId = (await db.allowancePeriod.create({ data: { employeeId: requesterId, regionId: uae.id, startDate: day("2026-01-01"), opening: 10 } })).id;
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId: requesterId } });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: { in: [requesterId, approverId, hrId] } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.$disconnect();
  });

  it("full hot path: PENDING does not debit; APPROVE debits; CANCEL restores (whole days)", async () => {
    const req = await pending({ startISO: "2026-12-01", days: 3 });

    // 1) PENDING — the engine counts the days as pending, NOT taken; available reflects the hold.
    const atPending = await getOpenPeriodBalance(requesterId);
    expect(atPending?.takenApproved).toBe(0);
    expect(atPending?.pending).toBe(3);
    expect(atPending?.available).toBe(7); // 10 − 3 pending

    // 2) APPROVE (assigned approver) — status flips, allowance is DEBITED via core/allowance.
    const approveRes = await decideLeaveRequest(approver(), req.id, "APPROVE", "Enjoy");
    expect(approveRes.ok).toBe(true);
    const approvedRow = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(approvedRow.status).toBe("APPROVED");
    expect(approvedRow.decisionById).toBe(approverId);
    expect(approvedRow.decisionAt).not.toBeNull();

    const atApproved = await getOpenPeriodBalance(requesterId);
    expect(atApproved?.takenApproved).toBe(3); // now taken
    expect(atApproved?.pending).toBe(0);
    expect(atApproved?.available).toBe(7); // 10 − 3 taken

    // 3) CANCEL (HR, since it's APPROVED) — allowance RESTORES automatically (no hand-written number).
    const cancelRes = await cancelLeaveRequest(hr(), req.id);
    expect(cancelRes.ok).toBe(true);
    const cancelledRow = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(cancelledRow.status).toBe("CANCELLED");

    const atCancelled = await getOpenPeriodBalance(requesterId);
    expect(atCancelled?.takenApproved).toBe(0); // no longer taken
    expect(atCancelled?.pending).toBe(0);
    expect(atCancelled?.available).toBe(10); // fully restored

    // The whole transition is audited.
    expect(await db.auditEvent.findFirst({ where: { action: "LEAVE_CANCEL", entityId: req.id } })).toBeTruthy();
  });

  it("debits and restores HALF days correctly (0.5)", async () => {
    const req = await db.leaveRequest.create({
      data: {
        employeeId: requesterId,
        leaveTypeId: typeId,
        startDate: day("2026-12-02"),
        endDate: day("2026-12-02"),
        durationMode: "HALF",
        workingDays: 0.5,
        allowanceDays: 0.5,
        status: "PENDING",
        allowancePeriodId: periodId,
        createdById: requesterId,
      },
    });

    expect((await getOpenPeriodBalance(requesterId))?.available).toBe(9.5); // 10 − 0.5 pending

    expect((await decideLeaveRequest(approver(), req.id, "APPROVE")).ok).toBe(true);
    const approved = await getOpenPeriodBalance(requesterId);
    expect(approved?.takenApproved).toBe(0.5);
    expect(approved?.available).toBe(9.5);

    expect((await cancelLeaveRequest(hr(), req.id)).ok).toBe(true);
    const restored = await getOpenPeriodBalance(requesterId);
    expect(restored?.takenApproved).toBe(0);
    expect(restored?.available).toBe(10); // restored
  });

  it("the owner can self-cancel a PENDING request (before approval), releasing the hold", async () => {
    const req = await pending({ startISO: "2026-12-03", days: 2 });
    expect((await getOpenPeriodBalance(requesterId))?.pending).toBe(2);

    const res = await cancelLeaveRequest(actor({ employeeId: requesterId, role: "STAFF" }), req.id);
    expect(res.ok).toBe(true);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");

    const after = await getOpenPeriodBalance(requesterId);
    expect(after?.pending).toBe(0); // hold released
    expect(after?.available).toBe(10);
  });
});
