// Story 26.1 — Per-type "requires approval": integration tests.
// requiresApproval=false → auto-approves at submit (APPROVED status, audited, debits allowance).
// Over-booking on a no-approval type is still hard-blocked.
// requiresApproval=true (default) → normal PENDING flow unchanged.
// Self-skips when the DB is unreachable (same pattern as sibling integration tests).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLeaveType } from "@/lib/config";
import { submitLeave, type LeaveInput } from "@/lib/leave";
import { getOpenPeriodBalance } from "@/lib/allowance";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[requires-approval.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "ra26-it-";
const CODE_AUTO = "RA26A"; // requiresApproval: false, deductsAllowance: true
const CODE_MANUAL = "RA26M"; // requiresApproval: true  (default)
const CODE_FREE = "RA26F"; // requiresApproval: false, deductsAllowance: false

let employeeId = "";
let autoTypeId = "";
let manualTypeId = "";
let freeTypeId = "";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function input(over: Partial<LeaveInput> & Pick<LeaveInput, "leaveTypeId">): LeaveInput {
  return { mode: "DAY", startDate: "2026-09-01", ...over };
}

suite("Story 26.1 — requiresApproval enforcement (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });

    // Clean up any leftover data from previous runs.
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_AUTO, CODE_MANUAL, CODE_FREE] } } });

    autoTypeId = (
      await db.leaveType.create({
        data: { name: "RA26 Auto Approve", code: CODE_AUTO, color: "#2F6FEB", deductsAllowance: true, requiresApproval: false },
      })
    ).id;

    manualTypeId = (
      await db.leaveType.create({
        data: { name: "RA26 Manual", code: CODE_MANUAL, color: "#E8833A", deductsAllowance: true, requiresApproval: true },
      })
    ).id;

    freeTypeId = (
      await db.leaveType.create({
        data: { name: "RA26 Free Auto", code: CODE_FREE, color: "#7C3AED", deductsAllowance: false, requiresApproval: false },
      })
    ).id;

    employeeId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}staff@interestingtimes.me`,
          firstName: "RA",
          lastName: "Tester",
          regionId: uae.id,
          joiningDate: day("2024-01-01"),
          role: "STAFF",
        },
      })
    ).id;

    // Opening of 3 — easy to trigger over-booking.
    await db.allowancePeriod.create({
      data: { employeeId, regionId: uae.id, startDate: day("2026-01-01"), opening: 3 },
    });
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId } });
    await db.auditEvent.deleteMany({ where: { entity: "LeaveRequest", actorId: employeeId } });
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId } });
    await db.auditEvent.deleteMany({ where: { entity: "LeaveRequest", actorId: employeeId } });
    await db.allowancePeriod.deleteMany({ where: { employeeId } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_AUTO, CODE_MANUAL, CODE_FREE] } } });
    await db.$disconnect();
  });

  it("requiresApproval=false: submits straight to APPROVED, debits allowance, records audit", async () => {
    const res = await submitLeave(employeeId, input({ leaveTypeId: autoTypeId }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: res.id } });
    expect(row.status).toBe("APPROVED");
    expect(row.allowanceDays).toBe(1);

    // Allowance is debited immediately (APPROVED → core/allowance counts as taken).
    const bal = await getOpenPeriodBalance(employeeId);
    expect(bal?.takenApproved).toBe(1);
    expect(bal?.pending).toBe(0);
    expect(bal?.available).toBe(2); // 3 − 1 taken

    // Audit entry written.
    const audit = await db.auditEvent.findFirst({ where: { action: "LEAVE_AUTO_APPROVED", entityId: res.id } });
    expect(audit).not.toBeNull();
    expect((audit?.after as Record<string, unknown>)?.reason).toBe("requiresApproval=false");
  });

  it("requiresApproval=true: submits as PENDING (unchanged behaviour)", async () => {
    const res = await submitLeave(employeeId, input({ leaveTypeId: manualTypeId, startDate: "2026-09-02" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: res.id } });
    expect(row.status).toBe("PENDING");

    const bal = await getOpenPeriodBalance(employeeId);
    expect(bal?.takenApproved).toBe(0);
    expect(bal?.pending).toBe(1);
    expect(bal?.available).toBe(2); // 3 − 1 pending
  });

  it("requiresApproval=false: over-booking is hard-blocked (not created as APPROVED)", async () => {
    // Request 5 days when only 3 are available. 2026-09-01 (Mon) to 2026-09-05 (Fri) = 5 working days.
    const res = await submitLeave(
      employeeId,
      input({ leaveTypeId: autoTypeId, mode: "MULTI", startDate: "2026-09-01", endDate: "2026-09-05" }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Either the validateLeaveRequest over-booking message or the decideLeave over-commit message.
    const errText = res.errors.join(" ");
    expect(errText).toMatch(/balance|over-commit/i);

    // Nothing created.
    const count = await db.leaveRequest.count({ where: { employeeId } });
    expect(count).toBe(0);
  });

  it("createLeaveType with requiresApproval omitted/false persists requiresApproval=false (checkbox-unchecked fix)", async () => {
    const CODE = "RA26X";
    await db.leaveType.deleteMany({ where: { code: CODE } });
    // Simulate the form action reading `=== "on"` when checkbox is unchecked → passes false.
    const id = await createLeaveType("system", {
      name: "RA26 No-approval create",
      code: CODE,
      color: "#000000",
      deductsAllowance: false,
      paid: true,
      noteRequired: false,
      requiresApproval: false, // checkbox unchecked
    });
    const row = await db.leaveType.findUniqueOrThrow({ where: { id } });
    expect(row.requiresApproval).toBe(false);
    await db.leaveType.delete({ where: { id } });
  });

  it("requiresApproval=false, deductsAllowance=false: auto-approves without touching the allowance", async () => {
    const res = await submitLeave(employeeId, input({ leaveTypeId: freeTypeId, startDate: "2026-09-03" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: res.id } });
    expect(row.status).toBe("APPROVED");
    expect(row.allowanceDays).toBe(0);

    // Allowance untouched.
    const bal = await getOpenPeriodBalance(employeeId);
    expect(bal?.takenApproved).toBe(0);
    expect(bal?.available).toBe(3);

    const audit = await db.auditEvent.findFirst({ where: { action: "LEAVE_AUTO_APPROVED", entityId: res.id } });
    expect(audit).not.toBeNull();
  });
});
