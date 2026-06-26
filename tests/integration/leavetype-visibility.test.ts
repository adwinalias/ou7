// Integration tests for story 27.1 — per-type visibility filtering on wall chart + who's off.
// Three leave types with NON-OVERLAPPING date ranges so each lands in distinct day cells.
// This avoids the buildRow "one winner per cell" collapse that would merge overlapping spans.
// Four actors: HR, approver, plain staff (viewer), "other" staff (booker).
// Asserts server-side: hidden rows are ABSENT from the returned payload, not just masked.
// Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWallChart } from "@/lib/wallchart";
import { getWhosOff } from "@/lib/whosoff";
import type { Actor } from "@/core/types";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[leavetype-visibility.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "vis27-";
const CODE_EV = "V27E"; // EVERYONE
const CODE_AP = "V27A"; // APPROVERS_SUPERUSERS
const CODE_HR = "V27H"; // HR_ONLY

// Non-overlapping working-day spans in Feb 2027 (UAE: Sat/Sun are weekend).
// 2027-02-01=Mon, 02=Tue, 03=Wed, 04=Thu, 05=Fri, 08=Mon, 09=Tue
const EV_START = "2027-02-01"; // Mon
const EV_END   = "2027-02-02"; // Tue  → 2 working days
const AP_START = "2027-02-04"; // Thu
const AP_END   = "2027-02-05"; // Fri  → 2 working days
const HR_START = "2027-02-08"; // Mon
const HR_END   = "2027-02-09"; // Tue  → 2 working days

// A day known to be occupied only by each type (for kind-based assertions on non-HR actors
// where abstractCode rewrites all three codes to "OUT").
const EV_DAY = "2027-02-01";
const AP_DAY = "2027-02-04";
const HR_DAY = "2027-02-08";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let hrActorId      = "";
let approverActorId = "";
let staffActorId   = "";
let otherStaffId   = "";

let HR_ACTOR:       Actor;
let APPROVER_ACTOR: Actor;
let STAFF_ACTOR:    Actor;
let OTHER_ACTOR:    Actor; // the booker (owns the leave rows)

suite("Per-type visibility (story 27.1)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });

    // Clean up previous runs.
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_EV, CODE_AP, CODE_HR] } } });

    // Leave types — one per visibility level, all visibleOnWallChart.
    const [ltEv, ltAp, ltHr] = await Promise.all([
      db.leaveType.create({ data: { name: "Vis27 Everyone",  code: CODE_EV, color: "#2F6FEB", visibleOnWallChart: true, visibility: "EVERYONE" } }),
      db.leaveType.create({ data: { name: "Vis27 Approvers", code: CODE_AP, color: "#E8833A", visibleOnWallChart: true, visibility: "APPROVERS_SUPERUSERS" } }),
      db.leaveType.create({ data: { name: "Vis27 HR Only",   code: CODE_HR, color: "#C0392B", visibleOnWallChart: true, visibility: "HR_ONLY" } }),
    ]);

    const [hrEmp, approverEmp, staffEmp, otherEmp] = await Promise.all([
      db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`,       firstName: "Vis27", lastName: "HR",       regionId: uae.id, joiningDate: day("2024-01-01"), role: "HR",      approverLevel: "NONE" } }),
      db.employee.create({ data: { email: `${PREFIX}approver@interestingtimes.me`, firstName: "Vis27", lastName: "Approver", regionId: uae.id, joiningDate: day("2024-01-01"), role: "APPROVER", approverLevel: "APPROVER" } }),
      db.employee.create({ data: { email: `${PREFIX}staff@interestingtimes.me`,    firstName: "Vis27", lastName: "Staff",    regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF",    approverLevel: "NONE" } }),
      db.employee.create({ data: { email: `${PREFIX}other@interestingtimes.me`,    firstName: "Vis27", lastName: "Other",    regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF",    approverLevel: "NONE" } }),
    ]);

    hrActorId       = hrEmp.id;
    approverActorId = approverEmp.id;
    staffActorId    = staffEmp.id;
    otherStaffId    = otherEmp.id;

    HR_ACTOR       = { employeeId: hrActorId,       role: "HR",       approverLevel: "NONE",     status: "ACTIVE", approverForIds: [] };
    APPROVER_ACTOR = { employeeId: approverActorId,  role: "APPROVER", approverLevel: "APPROVER", status: "ACTIVE", approverForIds: [otherStaffId] };
    STAFF_ACTOR    = { employeeId: staffActorId,     role: "STAFF",    approverLevel: "NONE",     status: "ACTIVE", approverForIds: [] };
    OTHER_ACTOR    = { employeeId: otherStaffId,     role: "STAFF",    approverLevel: "NONE",     status: "ACTIVE", approverForIds: [] };

    // Three non-overlapping APPROVED bookings — different spans so cells don't collapse.
    await Promise.all([
      db.leaveRequest.create({ data: { employeeId: otherStaffId, leaveTypeId: ltEv.id, startDate: day(EV_START), endDate: day(EV_END), durationMode: "DAY", workingDays: 2, allowanceDays: 2, status: "APPROVED", createdById: otherStaffId } }),
      db.leaveRequest.create({ data: { employeeId: otherStaffId, leaveTypeId: ltAp.id, startDate: day(AP_START), endDate: day(AP_END), durationMode: "DAY", workingDays: 2, allowanceDays: 2, status: "APPROVED", createdById: otherStaffId } }),
      db.leaveRequest.create({ data: { employeeId: otherStaffId, leaveTypeId: ltHr.id, startDate: day(HR_START), endDate: day(HR_END), durationMode: "DAY", workingDays: 2, allowanceDays: 2, status: "APPROVED", createdById: otherStaffId } }),
    ]);
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_EV, CODE_AP, CODE_HR] } } });
    await db.$disconnect();
  });

  // ─── Wall chart helpers ──────────────────────────────────────────────────────

  // Returns the cell kind for the "other" employee on a specific ISO date.
  // "none" means that date's booking is absent from the payload (filtered out).
  function otherCellKind(data: Awaited<ReturnType<typeof getWallChart>>, iso: string) {
    const row = data.rows.find((r) => r.employeeId === otherStaffId);
    if (!row) return "none";
    return row.cells.find((c) => c.iso === iso)?.kind ?? "none";
  }

  // For HR only: returns the raw leave-type code on the "other" employee's cell.
  function otherCellCode(data: Awaited<ReturnType<typeof getWallChart>>, iso: string) {
    const row = data.rows.find((r) => r.employeeId === otherStaffId);
    if (!row) return undefined;
    return row.cells.find((c) => c.iso === iso)?.code;
  }

  // ─── Wall chart: HR sees real codes ─────────────────────────────────────────

  it("wallchart: HR sees all three leave-type codes in their real cells", async () => {
    const data = await getWallChart(2027, 2, HR_ACTOR);
    expect(otherCellCode(data, EV_DAY)).toBe(CODE_EV);
    expect(otherCellCode(data, AP_DAY)).toBe(CODE_AP);
    expect(otherCellCode(data, HR_DAY)).toBe(CODE_HR);
  });

  // ─── Wall chart: approver sees EVERYONE + AP days, HR_ONLY day absent ───────

  it("wallchart: approver sees EVERYONE and APPROVERS_SUPERUSERS days but not HR_ONLY day", async () => {
    const data = await getWallChart(2027, 2, APPROVER_ACTOR);
    // EVERYONE day present (kind = approved)
    expect(otherCellKind(data, EV_DAY)).toBe("approved");
    // AP day present (kind = approved)
    expect(otherCellKind(data, AP_DAY)).toBe("approved");
    // HR_ONLY day absent from payload → cell reverts to "none" (no covering segment returned)
    expect(otherCellKind(data, HR_DAY)).toBe("none");
  });

  // ─── Wall chart: plain staff sees only EVERYONE day ─────────────────────────

  it("wallchart: plain staff sees only EVERYONE day; AP and HR_ONLY days absent", async () => {
    const data = await getWallChart(2027, 2, STAFF_ACTOR);
    expect(otherCellKind(data, EV_DAY)).toBe("approved");
    expect(otherCellKind(data, AP_DAY)).toBe("none"); // absent from payload
    expect(otherCellKind(data, HR_DAY)).toBe("none"); // absent from payload
  });

  // ─── Wall chart: owner sees all three of their own rows (own-leave override) ─

  it("wallchart: booking owner sees all three spans regardless of visibility", async () => {
    const data = await getWallChart(2027, 2, OTHER_ACTOR);
    expect(otherCellKind(data, EV_DAY)).toBe("approved");
    expect(otherCellKind(data, AP_DAY)).toBe("approved");
    expect(otherCellKind(data, HR_DAY)).toBe("approved");
  });

  // ─── Who's off widget ────────────────────────────────────────────────────────

  // 2027-02-01 is ~220 days from 2026-06-26. Window of 250 covers all three spans.
  const WINDOW = 250;

  it("whosoff: plain staff payload has exactly one entry for other (EVERYONE type only)", async () => {
    const data = await getWhosOff(STAFF_ACTOR, WINDOW);
    const otherEntries = data.entries.filter((e) => e.employeeId === otherStaffId);
    expect(otherEntries).toHaveLength(1);
    expect(otherEntries[0]!.category).toBe("Out"); // V27E maps to Out
  });

  it("whosoff: approver payload has exactly two entries for other (EVERYONE + AP, no HR_ONLY)", async () => {
    const data = await getWhosOff(APPROVER_ACTOR, WINDOW);
    const otherEntries = data.entries.filter((e) => e.employeeId === otherStaffId);
    expect(otherEntries).toHaveLength(2);
  });

  it("whosoff: HR sees all three entries for other", async () => {
    const data = await getWhosOff(HR_ACTOR, WINDOW);
    const otherEntries = data.entries.filter((e) => e.employeeId === otherStaffId);
    expect(otherEntries).toHaveLength(3);
  });

  it("whosoff: owner sees all three of their own entries regardless of visibility", async () => {
    const data = await getWhosOff(OTHER_ACTOR, WINDOW);
    const ownEntries = data.entries.filter((e) => e.employeeId === otherStaffId);
    expect(ownEntries).toHaveLength(3);
  });
});
