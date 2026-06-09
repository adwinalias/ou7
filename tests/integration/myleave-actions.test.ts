// Integration tests for the My-Leave owner actions (cancel + reminder). These reuse the
// existing libs (cancelLeaveRequest / sendReminder) that the server actions wrap — verifying
// the OWNER path: an owner cancels/reminds an eligible own request, and is blocked otherwise.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cancelLeaveRequest } from "@/lib/cancellation";
import { sendReminder } from "@/lib/reminders";
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
if (!dbUp) console.warn("[myleave-actions.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "mla-it-";
const TYPE = "MLAV";
let ownerId = "";
let typeId = "";
let periodId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const owner = (): Actor => ({ employeeId: ownerId, role: "STAFF", approverLevel: "NONE", status: "ACTIVE", approverForIds: [] });

async function mkOwn(status: "PENDING" | "APPROVED", startISO: string) {
  return db.leaveRequest.create({ data: { employeeId: ownerId, leaveTypeId: typeId, startDate: day(startISO), endDate: day(startISO), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status, allowancePeriodId: periodId, createdById: ownerId } });
}

suite("My-Leave owner actions (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    typeId = (await db.leaveType.create({ data: { name: "MLA Vacation", code: TYPE, color: "#2F6FEB", deductsAllowance: true } })).id;
    ownerId = (await db.employee.create({ data: { email: `${PREFIX}owner@interestingtimes.me`, firstName: "Olive", lastName: "Owner", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    periodId = (await db.allowancePeriod.create({ data: { employeeId: ownerId, regionId: uae.id, startDate: day("2026-01-01"), opening: 26 } })).id;
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId: ownerId } });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: ownerId } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.$disconnect();
  });

  it("owner self-cancels an eligible own PENDING request (before start)", async () => {
    const req = await mkOwn("PENDING", "2026-12-01"); // future
    expect((await cancelLeaveRequest(owner(), req.id)).ok).toBe(true);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
  });

  it("owner is blocked from cancelling their own APPROVED request (needs HR)", async () => {
    const req = await mkOwn("APPROVED", "2026-12-01");
    const res = await cancelLeaveRequest(owner(), req.id);
    expect(res.ok).toBe(false);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
  });

  it("owner sends a reminder on their own PENDING request", async () => {
    const req = await mkOwn("PENDING", "2026-12-01");
    const res = await sendReminder(owner(), req.id);
    expect(res.ok).toBe(true);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).followUpCount).toBe(1);
  });
});
