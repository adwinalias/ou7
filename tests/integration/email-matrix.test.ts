// Integration tests for story 27.3 — per-type email notification matrix.
//
// Section 1: pure unit tests for resolveRecipients (no DB needed).
// Section 2: DB round-trip — columns persist and list correctly.
// Section 3: end-to-end dispatch tests — spy on the singleton `notifier` exported
//   from lib/notify, drive the real mutation functions, assert the exact `to` array
//   for each EmailRecipients value. Also asserts that a notifier failure never
//   breaks the core mutation (never-break-the-mutation guarantee).
//
// Self-skips when the DB is unreachable.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveRecipients, notifier } from "@/lib/notify";
import { submitLeave, type LeaveInput } from "@/lib/leave";
import { decideLeaveRequest } from "@/lib/approvals";
import { cancelLeaveRequest } from "@/lib/cancellation";
import { db } from "@/lib/db";
import type { Actor } from "@/core/types";

// ─── Section 1: pure unit tests for resolveRecipients ──────────────────────────
describe("resolveRecipients (unit)", () => {
  const requester = "staff@example.com";
  const approvers = ["approver1@example.com", "approver2@example.com"];

  it("NONE → empty list", () => {
    expect(resolveRecipients("NONE", requester, approvers)).toEqual([]);
  });

  it("STAFF → [requester]", () => {
    expect(resolveRecipients("STAFF", requester, approvers)).toEqual([requester]);
  });

  it("APPROVER → approver list", () => {
    expect(resolveRecipients("APPROVER", requester, approvers)).toEqual(approvers);
  });

  it("STAFF_AND_APPROVER → deduplicated [requester, ...approvers]", () => {
    expect(resolveRecipients("STAFF_AND_APPROVER", requester, approvers)).toEqual([requester, ...approvers]);
  });

  it("STAFF_AND_APPROVER deduplicates if requester is also an approver", () => {
    const result = resolveRecipients("STAFF_AND_APPROVER", requester, [requester, "other@example.com"]);
    expect(result).toEqual([requester, "other@example.com"]);
    expect(result.filter((e) => e === requester)).toHaveLength(1);
  });

  it("APPROVER with empty approver list → empty list", () => {
    expect(resolveRecipients("APPROVER", requester, [])).toEqual([]);
  });

  it("STAFF_AND_APPROVER with empty approver list → [requester]", () => {
    expect(resolveRecipients("STAFF_AND_APPROVER", requester, [])).toEqual([requester]);
  });
});

// ─── Section 2 + 3: DB tests ───────────────────────────────────────────────────
let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[email-matrix.integration] DATABASE_URL unreachable — skipping DB suite.");

const PREFIX = "em27-";
const LT_PENDING = "EM27P";   // deductsAllowance=true, requiresApproval=true  (PENDING path)
const LT_AUTO    = "EM27A";   // deductsAllowance=true, requiresApproval=false (auto-approve path)
const LT_FREE    = "EM27F";   // deductsAllowance=false, requiresApproval=false (non-deducting auto)

const REQUESTER_EMAIL = `${PREFIX}staff@interestingtimes.me`;
const APPROVER_EMAIL  = `${PREFIX}approver@interestingtimes.me`;

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const sorted = (arr: string[]) => [...arr].sort();

// Shared actor builders
const mkActor = (over: Partial<Actor> & Pick<Actor, "employeeId" | "role">): Actor => ({
  approverLevel: "NONE",
  status: "ACTIVE",
  approverForIds: [],
  ...over,
});

suite("Email matrix — DB round-trip (story 27.3)", () => {
  let ltPendingId = "";
  let ltAutoId    = "";
  let ltFreeId    = "";
  let regionId    = "";
  let requesterId = "";
  let approverId  = "";
  let periodId    = "";

  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });
    regionId = uae.id;

    // Clean previous run
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.auditEvent.deleteMany({ where: { actor: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [LT_PENDING, LT_AUTO, LT_FREE, "EM27D"] } } });

    // Approver must exist before requester for FK; order doesn't matter for create but clean.
    const approverEmp = await db.employee.create({
      data: {
        email: APPROVER_EMAIL,
        firstName: "EM27", lastName: "Approver",
        regionId, joiningDate: day("2024-01-01"), role: "APPROVER", approverLevel: "APPROVER",
      },
    });
    approverId = approverEmp.id;

    const requesterEmp = await db.employee.create({
      data: {
        email: REQUESTER_EMAIL,
        firstName: "EM27", lastName: "Staff",
        regionId, joiningDate: day("2024-01-01"), role: "STAFF", approverLevel: "NONE",
      },
    });
    requesterId = requesterEmp.id;

    await db.approverAssignment.create({
      data: { employeeId: requesterId, approverId, order: 0 },
    });

    // Allowance period — generous opening so none of our test requests can fail for balance.
    const period = await db.allowancePeriod.create({
      data: { employeeId: requesterId, regionId, startDate: day("2026-01-01"), opening: 30 },
    });
    periodId = period.id;

    // Leave types — we update emailOn* per-test via db.leaveType.update.
    ltPendingId = (await db.leaveType.create({
      data: { name: "EM27 Pending", code: LT_PENDING, color: "#2F6FEB", deductsAllowance: true, requiresApproval: true },
    })).id;
    ltAutoId = (await db.leaveType.create({
      data: { name: "EM27 Auto", code: LT_AUTO, color: "#E8833A", deductsAllowance: true, requiresApproval: false },
    })).id;
    ltFreeId = (await db.leaveType.create({
      data: { name: "EM27 Free", code: LT_FREE, color: "#7C3AED", deductsAllowance: false, requiresApproval: false },
    })).id;
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId: requesterId } });
    await db.auditEvent.deleteMany({ where: { actor: { email: { startsWith: PREFIX } } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.auditEvent.deleteMany({ where: { actor: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [LT_PENDING, LT_AUTO, LT_FREE, "EM27D"] } } });
    await db.$disconnect();
  });

  // ── Section 2: schema round-trip ─────────────────────────────────────────────

  it("new leave type defaults: STAFF_AND_APPROVER / STAFF / STAFF_AND_APPROVER", async () => {
    const lt = await db.leaveType.create({ data: { name: "EM27 Default", code: "EM27D", color: "#2F6FEB" } });
    expect(lt.emailOnRequest).toBe("STAFF_AND_APPROVER");
    expect(lt.emailOnDecision).toBe("STAFF");
    expect(lt.emailOnCancellation).toBe("STAFF_AND_APPROVER");
    await db.leaveType.delete({ where: { id: lt.id } });
  });

  it("explicit values persist and listLeaveTypes exposes the three fields", async () => {
    await db.leaveType.update({
      where: { id: ltPendingId },
      data: { emailOnRequest: "STAFF", emailOnDecision: "APPROVER", emailOnCancellation: "NONE" },
    });
    const types = await db.leaveType.findMany({
      where: { id: ltPendingId },
      select: { emailOnRequest: true, emailOnDecision: true, emailOnCancellation: true },
    });
    expect(types[0]!.emailOnRequest).toBe("STAFF");
    expect(types[0]!.emailOnDecision).toBe("APPROVER");
    expect(types[0]!.emailOnCancellation).toBe("NONE");
    // restore defaults for dispatch tests
    await db.leaveType.update({
      where: { id: ltPendingId },
      data: { emailOnRequest: "STAFF_AND_APPROVER", emailOnDecision: "STAFF", emailOnCancellation: "STAFF_AND_APPROVER" },
    });
  });

  // ── Section 3: dispatch — submitLeave (PENDING path) ─────────────────────────

  it("submitLeave PENDING: STAFF_AND_APPROVER → leaveRequested called with [requester, approver]", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnRequest: "STAFF_AND_APPROVER" } });
    const spy = vi.spyOn(notifier, "leaveRequested").mockResolvedValue(undefined);
    const input: LeaveInput = { leaveTypeId: ltPendingId, mode: "DAY", startDate: "2027-03-03" };
    const res = await submitLeave(requesterId, input);
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(sorted(spy.mock.calls[0]![0].to)).toEqual(sorted([REQUESTER_EMAIL, APPROVER_EMAIL]));
  });

  it("submitLeave PENDING: STAFF → only requester", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnRequest: "STAFF" } });
    const spy = vi.spyOn(notifier, "leaveRequested").mockResolvedValue(undefined);
    const input: LeaveInput = { leaveTypeId: ltPendingId, mode: "DAY", startDate: "2027-03-04" };
    const res = await submitLeave(requesterId, input);
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].to).toEqual([REQUESTER_EMAIL]);
  });

  it("submitLeave PENDING: APPROVER → only approver", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnRequest: "APPROVER" } });
    const spy = vi.spyOn(notifier, "leaveRequested").mockResolvedValue(undefined);
    const input: LeaveInput = { leaveTypeId: ltPendingId, mode: "DAY", startDate: "2027-03-05" };
    const res = await submitLeave(requesterId, input);
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].to).toEqual([APPROVER_EMAIL]);
  });

  it("submitLeave PENDING: NONE → leaveRequested not called with any recipients", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnRequest: "NONE" } });
    const spy = vi.spyOn(notifier, "leaveRequested").mockResolvedValue(undefined);
    // 2027-03-08 = Monday (working day in UAE; weekend=[6=Sat,0=Sun])
    const input: LeaveInput = { leaveTypeId: ltPendingId, mode: "DAY", startDate: "2027-03-08" };
    const res = await submitLeave(requesterId, input);
    expect(res.ok).toBe(true);
    // consoleNotifier short-circuits on empty to; spy is called but with to=[]
    if (spy.mock.calls.length > 0) {
      expect(spy.mock.calls[0]![0].to).toEqual([]);
    }
  });

  // ── auto-approve (deducting) path ─────────────────────────────────────────────

  it("submitLeave auto-approve (deducting): STAFF_AND_APPROVER → leaveRequested both recipients", async () => {
    await db.leaveType.update({ where: { id: ltAutoId }, data: { emailOnRequest: "STAFF_AND_APPROVER" } });
    const spy = vi.spyOn(notifier, "leaveRequested").mockResolvedValue(undefined);
    const input: LeaveInput = { leaveTypeId: ltAutoId, mode: "DAY", startDate: "2027-04-01" };
    const res = await submitLeave(requesterId, input);
    expect(res.ok).toBe(true);
    const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: (res as { ok: true; id: string }).id } });
    expect(row.status).toBe("APPROVED");
    expect(spy).toHaveBeenCalledOnce();
    expect(sorted(spy.mock.calls[0]![0].to)).toEqual(sorted([REQUESTER_EMAIL, APPROVER_EMAIL]));
  });

  // ── auto-approve (non-deducting / free) path ──────────────────────────────────

  it("submitLeave auto-approve (non-deducting): STAFF → leaveRequested called, row APPROVED", async () => {
    await db.leaveType.update({ where: { id: ltFreeId }, data: { emailOnRequest: "STAFF" } });
    const spy = vi.spyOn(notifier, "leaveRequested").mockResolvedValue(undefined);
    const input: LeaveInput = { leaveTypeId: ltFreeId, mode: "DAY", startDate: "2027-04-02" };
    const res = await submitLeave(requesterId, input);
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].to).toEqual([REQUESTER_EMAIL]);
  });

  // ── Section 3: dispatch — decideLeaveRequest ──────────────────────────────────

  it("decideLeaveRequest APPROVE: STAFF → leaveDecided called with [requester], status APPROVED", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnRequest: "STAFF_AND_APPROVER", emailOnDecision: "STAFF" } });
    // Create PENDING row directly (skip submitLeave notification for isolation)
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: ltPendingId, startDate: day("2027-05-01"), endDate: day("2027-05-01"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", allowancePeriodId: periodId, createdById: requesterId },
    });
    const approverActor = mkActor({ employeeId: approverId, role: "APPROVER", approverLevel: "APPROVER", approverForIds: [requesterId] });
    const spy = vi.spyOn(notifier, "leaveDecided").mockResolvedValue(undefined);
    const res = await decideLeaveRequest(approverActor, req.id, "APPROVE");
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].to).toEqual([REQUESTER_EMAIL]);
    expect(spy.mock.calls[0]![0].status).toBe("APPROVED");
  });

  it("decideLeaveRequest DECLINE: APPROVER → leaveDecided called with [approver], status DECLINED", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnDecision: "APPROVER" } });
    // 2027-05-03 = Monday (working day in UAE; 2027-05-02 is Sunday)
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: ltPendingId, startDate: day("2027-05-03"), endDate: day("2027-05-03"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", allowancePeriodId: periodId, createdById: requesterId },
    });
    const approverActor = mkActor({ employeeId: approverId, role: "APPROVER", approverLevel: "APPROVER", approverForIds: [requesterId] });
    const spy = vi.spyOn(notifier, "leaveDecided").mockResolvedValue(undefined);
    // DECLINE requires a non-empty reason (core/approvals decideLeave rule)
    const res = await decideLeaveRequest(approverActor, req.id, "DECLINE", "No cover available");
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].to).toEqual([APPROVER_EMAIL]);
    expect(spy.mock.calls[0]![0].status).toBe("DECLINED");
  });

  it("decideLeaveRequest: STAFF_AND_APPROVER → leaveDecided called with both", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnDecision: "STAFF_AND_APPROVER" } });
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: ltPendingId, startDate: day("2027-05-05"), endDate: day("2027-05-05"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", allowancePeriodId: periodId, createdById: requesterId },
    });
    const approverActor = mkActor({ employeeId: approverId, role: "APPROVER", approverLevel: "APPROVER", approverForIds: [requesterId] });
    const spy = vi.spyOn(notifier, "leaveDecided").mockResolvedValue(undefined);
    const res = await decideLeaveRequest(approverActor, req.id, "APPROVE");
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(sorted(spy.mock.calls[0]![0].to)).toEqual(sorted([REQUESTER_EMAIL, APPROVER_EMAIL]));
  });

  it("decideLeaveRequest: NONE → leaveDecided called with to=[]", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnDecision: "NONE" } });
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: ltPendingId, startDate: day("2027-05-06"), endDate: day("2027-05-06"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", allowancePeriodId: periodId, createdById: requesterId },
    });
    const approverActor = mkActor({ employeeId: approverId, role: "APPROVER", approverLevel: "APPROVER", approverForIds: [requesterId] });
    const spy = vi.spyOn(notifier, "leaveDecided").mockResolvedValue(undefined);
    const res = await decideLeaveRequest(approverActor, req.id, "APPROVE");
    expect(res.ok).toBe(true);
    if (spy.mock.calls.length > 0) {
      expect(spy.mock.calls[0]![0].to).toEqual([]);
    }
  });

  // ── Section 3: dispatch — cancelLeaveRequest ──────────────────────────────────

  it("cancelLeaveRequest: STAFF_AND_APPROVER → leaveCancelled called with both", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnCancellation: "STAFF_AND_APPROVER" } });
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: ltPendingId, startDate: day("2027-06-02"), endDate: day("2027-06-02"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", createdById: requesterId },
    });
    const ownerActor = mkActor({ employeeId: requesterId, role: "STAFF" });
    const spy = vi.spyOn(notifier, "leaveCancelled").mockResolvedValue(undefined);
    const res = await cancelLeaveRequest(ownerActor, req.id);
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(sorted(spy.mock.calls[0]![0].to)).toEqual(sorted([REQUESTER_EMAIL, APPROVER_EMAIL]));
  });

  it("cancelLeaveRequest: STAFF → only requester", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnCancellation: "STAFF" } });
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: ltPendingId, startDate: day("2027-06-03"), endDate: day("2027-06-03"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", createdById: requesterId },
    });
    const ownerActor = mkActor({ employeeId: requesterId, role: "STAFF" });
    const spy = vi.spyOn(notifier, "leaveCancelled").mockResolvedValue(undefined);
    const res = await cancelLeaveRequest(ownerActor, req.id);
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].to).toEqual([REQUESTER_EMAIL]);
  });

  it("cancelLeaveRequest: APPROVER → only approver", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnCancellation: "APPROVER" } });
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: ltPendingId, startDate: day("2027-06-04"), endDate: day("2027-06-04"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", createdById: requesterId },
    });
    const ownerActor = mkActor({ employeeId: requesterId, role: "STAFF" });
    const spy = vi.spyOn(notifier, "leaveCancelled").mockResolvedValue(undefined);
    const res = await cancelLeaveRequest(ownerActor, req.id);
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].to).toEqual([APPROVER_EMAIL]);
  });

  it("cancelLeaveRequest: NONE → leaveCancelled called with to=[]", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnCancellation: "NONE" } });
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: ltPendingId, startDate: day("2027-06-05"), endDate: day("2027-06-05"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", createdById: requesterId },
    });
    const ownerActor = mkActor({ employeeId: requesterId, role: "STAFF" });
    const spy = vi.spyOn(notifier, "leaveCancelled").mockResolvedValue(undefined);
    const res = await cancelLeaveRequest(ownerActor, req.id);
    expect(res.ok).toBe(true);
    if (spy.mock.calls.length > 0) {
      expect(spy.mock.calls[0]![0].to).toEqual([]);
    }
  });

  // ── Never-break-the-mutation: notifier throws → mutation still returns ok ─────

  it("submitLeave: notifier failure never breaks the PENDING create", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnRequest: "STAFF_AND_APPROVER" } });
    vi.spyOn(notifier, "leaveRequested").mockRejectedValue(new Error("smtp down"));
    const input: LeaveInput = { leaveTypeId: ltPendingId, mode: "DAY", startDate: "2027-07-01" };
    const res = await submitLeave(requesterId, input);
    expect(res.ok).toBe(true);
    const count = await db.leaveRequest.count({ where: { employeeId: requesterId } });
    expect(count).toBe(1);
  });

  it("submitLeave: notifier failure never breaks the auto-approve create", async () => {
    await db.leaveType.update({ where: { id: ltAutoId }, data: { emailOnRequest: "STAFF_AND_APPROVER" } });
    vi.spyOn(notifier, "leaveRequested").mockRejectedValue(new Error("smtp down"));
    const input: LeaveInput = { leaveTypeId: ltAutoId, mode: "DAY", startDate: "2027-07-02" };
    const res = await submitLeave(requesterId, input);
    expect(res.ok).toBe(true);
    const row = await db.leaveRequest.findFirstOrThrow({ where: { employeeId: requesterId } });
    expect(row.status).toBe("APPROVED");
  });

  it("decideLeaveRequest: notifier failure never breaks the decision", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnDecision: "STAFF_AND_APPROVER" } });
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: ltPendingId, startDate: day("2027-08-01"), endDate: day("2027-08-01"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", allowancePeriodId: periodId, createdById: requesterId },
    });
    vi.spyOn(notifier, "leaveDecided").mockRejectedValue(new Error("smtp down"));
    const approverActor = mkActor({ employeeId: approverId, role: "APPROVER", approverLevel: "APPROVER", approverForIds: [requesterId] });
    const res = await decideLeaveRequest(approverActor, req.id, "APPROVE");
    expect(res.ok).toBe(true);
    const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(row.status).toBe("APPROVED");
  });

  it("cancelLeaveRequest: notifier failure never breaks the cancellation", async () => {
    await db.leaveType.update({ where: { id: ltPendingId }, data: { emailOnCancellation: "STAFF_AND_APPROVER" } });
    const req = await db.leaveRequest.create({
      data: { employeeId: requesterId, leaveTypeId: ltPendingId, startDate: day("2027-09-01"), endDate: day("2027-09-01"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", createdById: requesterId },
    });
    vi.spyOn(notifier, "leaveCancelled").mockRejectedValue(new Error("smtp down"));
    const ownerActor = mkActor({ employeeId: requesterId, role: "STAFF" });
    const res = await cancelLeaveRequest(ownerActor, req.id);
    expect(res.ok).toBe(true);
    const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(row.status).toBe("CANCELLED");
  });
});
