// Integration tests for cancellation (Epic 5.6): owner vs HR rules, 403, audit, and the
// allowance returning automatically when an APPROVED request is cancelled. Self-skips w/o DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cancelLeaveRequest } from "@/lib/cancellation";
import { getOpenPeriodBalance } from "@/lib/allowance";
import { AuthError } from "@/lib/rbac";
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
if (!dbUp) console.warn("[cancellation.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "cxl-it-";
const TYPE = "CXLV";
let ownerId = "";
let hrId = "";
let otherId = "";
let periodId = "";
let typeId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const actor = (over: Partial<Actor> & Pick<Actor, "employeeId" | "role">): Actor => ({ approverLevel: "NONE", status: "ACTIVE", approverForIds: [], ...over });
const owner = () => actor({ employeeId: ownerId, role: "STAFF" });
const hr = () => actor({ employeeId: hrId, role: "HR" });

async function mkRequest(over: { status: "PENDING" | "APPROVED"; startISO: string; days?: number }) {
  return db.leaveRequest.create({
    data: { employeeId: ownerId, leaveTypeId: typeId, startDate: day(over.startISO), endDate: day(over.startISO), durationMode: "DAY", workingDays: over.days ?? 1, allowanceDays: over.days ?? 1, status: over.status, allowancePeriodId: periodId, createdById: ownerId },
  });
}

suite("Cancellation (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    typeId = (await db.leaveType.create({ data: { name: "CXL Vacation", code: TYPE, color: "#2F6FEB", deductsAllowance: true } })).id;
    ownerId = (await db.employee.create({ data: { email: `${PREFIX}owner@interestingtimes.me`, firstName: "Own", lastName: "Er", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    hrId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "H", lastName: "R", regionId: uae.id, joiningDate: day("2024-01-01"), role: "HR" } })).id;
    otherId = (await db.employee.create({ data: { email: `${PREFIX}other@interestingtimes.me`, firstName: "Oth", lastName: "Er", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    periodId = (await db.allowancePeriod.create({ data: { employeeId: ownerId, regionId: uae.id, startDate: day("2026-01-01"), opening: 10 } })).id;
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId: ownerId } });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: { in: [ownerId, hrId, otherId] } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.$disconnect();
  });

  it("owner self-cancels a PENDING request before the start day (audited)", async () => {
    const req = await mkRequest({ status: "PENDING", startISO: "2026-12-01" }); // future
    const res = await cancelLeaveRequest(owner(), req.id);
    expect(res.ok).toBe(true);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
    expect(await db.auditEvent.findFirst({ where: { action: "LEAVE_CANCEL", entityId: req.id } })).toBeTruthy();
  });

  it("blocks owner self-cancel of a PENDING request on/after the start day", async () => {
    const req = await mkRequest({ status: "PENDING", startISO: "2026-01-01" }); // past
    const res = await cancelLeaveRequest(owner(), req.id);
    expect(res.ok).toBe(false);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
  });

  it("blocks owner cancelling an APPROVED request (needs HR)", async () => {
    const req = await mkRequest({ status: "APPROVED", startISO: "2026-12-01", days: 3 });
    const res = await cancelLeaveRequest(owner(), req.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/HR/i);
  });

  it("rejects a non-owner non-HR with 403", async () => {
    const req = await mkRequest({ status: "PENDING", startISO: "2026-12-01" });
    await expect(cancelLeaveRequest(actor({ employeeId: otherId, role: "STAFF" }), req.id)).rejects.toBeInstanceOf(AuthError);
  });

  it("HR cancels an APPROVED request and the allowance returns automatically", async () => {
    const req = await mkRequest({ status: "APPROVED", startISO: "2026-12-01", days: 3 });
    const before = await getOpenPeriodBalance(ownerId);
    expect(before?.takenApproved).toBe(3);
    expect(before?.available).toBe(7);

    const res = await cancelLeaveRequest(hr(), req.id);
    expect(res.ok).toBe(true);

    const after = await getOpenPeriodBalance(ownerId);
    expect(after?.takenApproved).toBe(0); // cancelled → no longer taken
    expect(after?.available).toBe(10); // returned
  });
});
