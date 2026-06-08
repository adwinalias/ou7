// Integration tests for the leave request orchestration (Epic 5.1–5.3) against a real
// Postgres: preview validation + persisting a PENDING request, built on the tested
// core/leave + core/allowance. Self-skips when the DB is unreachable.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getRequestContext, previewLeave, submitLeave, type LeaveInput } from "@/lib/leave";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[leave.integration] DATABASE_URL unreachable — skipping integration suite.");

const PREFIX = "leave-it-";
const VACATION = "ITV"; // deducts allowance, no note
const SICK = "ITSW"; // non-deducting, note required

let employeeId = "";
let vacationId = "";
let sickId = "";

const MON = "2026-03-02"; // weekday in UAE (weekend = Sat/Sun)
const MON2 = "2026-03-09";
const FRI = "2026-03-13";

function input(over: Partial<LeaveInput> & Pick<LeaveInput, "leaveTypeId">): LeaveInput {
  return { mode: "DAY", startDate: MON, ...over };
}

suite("Leave request preview + submit (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [VACATION, SICK] } } });

    vacationId = (
      await db.leaveType.create({
        data: { name: "IT Vacation", code: VACATION, color: "#2F6FEB", deductsAllowance: true },
      })
    ).id;
    sickId = (
      await db.leaveType.create({
        data: { name: "IT Sick", code: SICK, color: "#E8833A", deductsAllowance: false, noteRequired: true },
      })
    ).id;

    employeeId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}staff@interestingtimes.me`,
          firstName: "Leave",
          lastName: "Tester",
          regionId: uae.id,
          joiningDate: new Date("2024-01-01T00:00:00.000Z"),
          role: "STAFF",
        },
      })
    ).id;

    // Small opening (5) so over-booking is easy to trigger.
    await db.allowancePeriod.create({
      data: { employeeId, regionId: uae.id, startDate: new Date(Date.UTC(2026, 0, 1)), opening: 5 },
    });
  });

  beforeEach(async () => {
    // Isolate each test from leftover requests.
    await db.leaveRequest.deleteMany({ where: { employeeId } });
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId } });
    await db.allowancePeriod.deleteMany({ where: { employeeId } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [VACATION, SICK] } } });
    await db.$disconnect();
  });

  it("previews a valid one-day vacation and reports allowance impact", async () => {
    const res = await previewLeave(employeeId, input({ leaveTypeId: vacationId }));
    expect(res.ok).toBe(true);
    expect(res.workingDays).toBe(1);
    expect(res.freeDays).toBe(0);
    expect(res.allowanceDays).toBe(1);
    expect(res.availableBefore).toBe(5);
    expect(res.availableAfter).toBe(4);
  });

  it("submits a PENDING request with computed counts and a period link", async () => {
    const res = await submitLeave(employeeId, input({ leaveTypeId: vacationId, startDate: MON2 }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: res.id } });
    expect(row.status).toBe("PENDING");
    expect(row.allowanceDays).toBe(1);
    expect(row.workingDays).toBe(1);
    expect(row.allowancePeriodId).not.toBeNull();

    // Pending now reduces available (debited only on approval, but reserved as pending).
    const ctx = await getRequestContext(employeeId);
    expect(ctx.balance?.pending).toBe(1);
    expect(ctx.balance?.available).toBe(4);
  });

  it("blocks over-booking (no negative balance, no borrowing)", async () => {
    // 10 working days vs opening of 5.
    const res = await previewLeave(employeeId, input({ leaveTypeId: vacationId, mode: "MULTI", startDate: MON, endDate: FRI }));
    expect(res.workingDays).toBe(10);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/available balance/i);
  });

  it("blocks overlapping requests", async () => {
    const first = await submitLeave(employeeId, input({ leaveTypeId: vacationId, startDate: MON2 }));
    expect(first.ok).toBe(true);
    const res = await previewLeave(employeeId, input({ leaveTypeId: vacationId, startDate: MON2 }));
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/already requested/i);
  });

  it("enforces note-required leave types", async () => {
    const noNote = await previewLeave(employeeId, input({ leaveTypeId: sickId, startDate: FRI }));
    expect(noNote.ok).toBe(false);
    expect(noNote.errors.join(" ")).toMatch(/note is required/i);

    const withNote = await previewLeave(employeeId, input({ leaveTypeId: sickId, startDate: FRI, notes: "Flu" }));
    expect(withNote.ok).toBe(true);
  });

  it("non-deducting leave does not reduce allowance", async () => {
    const res = await submitLeave(employeeId, input({ leaveTypeId: sickId, startDate: FRI, notes: "Flu" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: res.id } })).allowanceDays).toBe(0);

    const ctx = await getRequestContext(employeeId);
    expect(ctx.balance?.available).toBe(5); // unchanged
    expect(ctx.balance?.pending).toBe(0);
  });
});
