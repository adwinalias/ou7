// Integration tests for story 28.3 — per-type "affects staffing levels" flag (ADR-0014).
// Three cases:
//   1. A colleague on a NON-affecting leave type does NOT reduce headcount → no coverage warning.
//   2. Booking a NON-affecting leave type yourself → no coverage warning (requester-type skip).
//   3. An AFFECTING type still triggers the warning (regression — default behaviour holds).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { previewLeave } from "@/lib/leave";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[coverage-affects-staffing.integration] DATABASE_URL unreachable — skipping integration suite.");

const PREFIX = "cov283-";
const CODE_AFFECTING = "ITCOV3A"; // affectsStaffingLevels=true (default)
const CODE_NON = "ITCOV3N";       // affectsStaffingLevels=false

let uaeId = "";
let deptId = "";
let affectingTypeId = "";
let nonAffectingTypeId = "";

// 3-person dept (empA=requester, empB=colleague), minStaffing=2.
let empAId = "";
let empBId = "";
let empCId = "";

// FUTURE Mon that avoids other test prefixes.
const MON = "2027-05-03";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

suite("Coverage — affectsStaffingLevels flag (story 28.3)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });
    uaeId = uae.id;

    // Clean leftover fixtures.
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_AFFECTING, CODE_NON] } } });
    await db.department.deleteMany({ where: { name: `${PREFIX}dept` } });

    // 3-person dept, minStaffing=2: need ≥2 present.
    const dept = await db.department.create({ data: { name: `${PREFIX}dept`, minStaffing: 2 } });
    deptId = dept.id;

    // Affecting leave type (default: affectsStaffingLevels=true).
    affectingTypeId = (
      await db.leaveType.create({
        data: { name: "Cov3 Affecting", code: CODE_AFFECTING, color: "#2F6FEB", deductsAllowance: false, requiresApproval: true },
      })
    ).id;

    // Non-affecting leave type (affectsStaffingLevels=false: e.g. Out-of-Office).
    nonAffectingTypeId = (
      await db.leaveType.create({
        data: { name: "Cov3 Non-Affecting", code: CODE_NON, color: "#888888", deductsAllowance: false, requiresApproval: true, affectsStaffingLevels: false },
      })
    ).id;

    const mk = (key: string, over: Record<string, unknown> = {}) =>
      db.employee.create({
        data: {
          email: `${PREFIX}${key}@interestingtimes.me`,
          firstName: key, lastName: "Cov3",
          regionId: uaeId, departmentId: deptId,
          joiningDate: day("2024-01-01"),
          status: "ACTIVE", role: "STAFF",
          ...over,
        },
        select: { id: true },
      });

    empAId = (await mk("empA")).id;
    empBId = (await mk("empB")).id;
    empCId = (await mk("empC")).id;
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId: { in: [empAId, empBId, empCId] } } });
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_AFFECTING, CODE_NON] } } });
    await db.department.deleteMany({ where: { name: `${PREFIX}dept` } });
    await db.$disconnect();
  });

  it("colleague on NON-affecting type does NOT reduce headcount — no warning despite only 1 other present", async () => {
    // empB + empC on non-affecting leave → they still "count" as present for staffing.
    // empA requesting affecting leave → 3 - 1 (requester) = 2 present ≥ minStaffing(2) → no breach.
    for (const id of [empBId, empCId]) {
      await db.leaveRequest.create({
        data: {
          employeeId: id, leaveTypeId: nonAffectingTypeId,
          startDate: day(MON), endDate: day(MON), durationMode: "DAY",
          workingDays: 1, allowanceDays: 0, status: "APPROVED", createdById: id,
        },
      });
    }
    // empA books an AFFECTING type — coverage sees 0 others absent (non-affecting don't count).
    const result = await previewLeave(empAId, { leaveTypeId: affectingTypeId, mode: "DAY", startDate: MON });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("same scenario with AFFECTING colleague leave → warning fires (regression)", async () => {
    // empB on affecting leave → headcount drops to 3 - 1 (empB) - 1 (empA requesting) = 1 < 2 → breach.
    await db.leaveRequest.create({
      data: {
        employeeId: empBId, leaveTypeId: affectingTypeId,
        startDate: day(MON), endDate: day(MON), durationMode: "DAY",
        workingDays: 1, allowanceDays: 0, status: "APPROVED", createdById: empBId,
      },
    });
    const result = await previewLeave(empAId, { leaveTypeId: affectingTypeId, mode: "DAY", startDate: MON });
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/minimum staffing/i);
  });

  it("requesting a NON-affecting type yourself → NO coverage warning even with dept fully booked", async () => {
    // empB + empC on affecting leave → headcount would breach for an affecting request.
    // But empA books NON-affecting → buildCoverageInput returns null immediately → no warning.
    for (const id of [empBId, empCId]) {
      await db.leaveRequest.create({
        data: {
          employeeId: id, leaveTypeId: affectingTypeId,
          startDate: day(MON), endDate: day(MON), durationMode: "DAY",
          workingDays: 1, allowanceDays: 0, status: "APPROVED", createdById: id,
        },
      });
    }
    const result = await previewLeave(empAId, { leaveTypeId: nonAffectingTypeId, mode: "DAY", startDate: MON });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
