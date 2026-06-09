import { PrismaClient } from "@prisma/client";

// Reset e2e fixtures so the specs are re-runnable. Assumes the DB is seeded
// (npm run db:seed) with the HR bootstrap user + regions + leave types.
//
//  - request.spec   : signs in as the HR user and books leave  → clear their leave.
//  - approvals.spec : signs in as the HR user (universal approver) and decides another
//                     employee's requests → (re)create a requester with two PENDING
//                     requests the HR user can approve / decline.
const HR_EMAIL = "adwin.alias@interestingtimes.me";
const REQUESTER_EMAIL = "e2e-requester@interestingtimes.me";
const APPROVE_DATE = "2026-09-07"; // a Monday (working day in UAE)
const DECLINE_DATE = "2026-10-05"; // a Monday

// Wall-chart fixture: a separate employee so wall-chart.spec is isolated from approvals.spec.
const WALL_EMAIL = "e2e-wall@interestingtimes.me";
const WALL_APPROVED = "2026-09-15"; // Tuesday
const WALL_PENDING = "2026-09-16"; // Wednesday
const WALL_SECRET = "WALL-SECRET-NOTE"; // must never appear in the wall-chart page (privacy)

// Audit fixture: a dedicated employee with a PENDING request only audit.spec touches.
const AUDIT_EMAIL = "e2e-audit@interestingtimes.me";
const AUDIT_DATE = "2026-11-16"; // Monday
const AUDIT_NOTE = "AUDIT approve me";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export default async function globalSetup() {
  const db = new PrismaClient();
  try {
    const uae = await db.region.findFirstOrThrow({ where: { name: "UAE" } });
    const vacation = await db.leaveType.findFirstOrThrow({ where: { code: "V" } });

    // Calendars.spec creates an "E2E "-prefixed holiday + restricted day via the UI — clear
    // them so it's re-runnable. (Dates chosen in the spec avoid other specs' booked dates.)
    await db.holiday.deleteMany({ where: { name: { startsWith: "E2E " } } });
    await db.restrictedDay.deleteMany({ where: { reason: { startsWith: "E2E " } } });

    // Employees.spec creates an "e2e-emp-" employee in the Remote region and expects the
    // "no policy" stop-flag — clear those employees + Remote's policies so it's deterministic.
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: "e2e-emp-" } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: "e2e-emp-" } } });
    const remote = await db.region.findFirst({ where: { name: "Remote" } });
    if (remote) await db.entitlementPolicy.deleteMany({ where: { regionId: remote.id } });

    // The HR user books their own leave in request.spec — start clean.
    await db.leaveRequest.deleteMany({ where: { employee: { email: HR_EMAIL } } });

    // A requester whose PENDING requests the HR user can act on.
    const requester = await db.employee.upsert({
      where: { email: REQUESTER_EMAIL },
      update: { status: "ACTIVE" },
      create: {
        email: REQUESTER_EMAIL,
        firstName: "Ess",
        lastName: "Requester",
        regionId: uae.id,
        joiningDate: day("2024-01-01"),
        role: "STAFF",
      },
    });

    let period = await db.allowancePeriod.findFirst({ where: { employeeId: requester.id, endDate: null } });
    if (!period) {
      period = await db.allowancePeriod.create({
        data: { employeeId: requester.id, regionId: uae.id, startDate: day("2026-01-01"), opening: 26 },
      });
    }

    await db.leaveRequest.deleteMany({ where: { employeeId: requester.id } });
    for (const [date, notes] of [
      [APPROVE_DATE, "E2E approve me"],
      [DECLINE_DATE, "E2E decline me"],
    ] as const) {
      await db.leaveRequest.create({
        data: {
          employeeId: requester.id,
          leaveTypeId: vacation.id,
          startDate: day(date),
          endDate: day(date),
          durationMode: "DAY",
          workingDays: 1,
          allowanceDays: 1,
          status: "PENDING",
          allowancePeriodId: period.id,
          createdById: requester.id,
          notes,
        },
      });
    }

    // Wall-chart fixture employee with one APPROVED (carrying a private note) + one PENDING.
    const waller = await db.employee.upsert({
      where: { email: WALL_EMAIL },
      update: { status: "ACTIVE" },
      create: { email: WALL_EMAIL, firstName: "Wanda", lastName: "Waller", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" },
    });
    let wPeriod = await db.allowancePeriod.findFirst({ where: { employeeId: waller.id, endDate: null } });
    if (!wPeriod) {
      wPeriod = await db.allowancePeriod.create({ data: { employeeId: waller.id, regionId: uae.id, startDate: day("2026-01-01"), opening: 26 } });
    }
    await db.leaveRequest.deleteMany({ where: { employeeId: waller.id } });
    await db.leaveRequest.create({
      data: {
        employeeId: waller.id,
        leaveTypeId: vacation.id,
        startDate: day(WALL_APPROVED),
        endDate: day(WALL_APPROVED),
        durationMode: "DAY",
        workingDays: 1,
        allowanceDays: 1,
        status: "APPROVED",
        allowancePeriodId: wPeriod.id,
        createdById: waller.id,
        notes: WALL_SECRET,
      },
    });
    await db.leaveRequest.create({
      data: {
        employeeId: waller.id,
        leaveTypeId: vacation.id,
        startDate: day(WALL_PENDING),
        endDate: day(WALL_PENDING),
        durationMode: "DAY",
        workingDays: 1,
        allowanceDays: 1,
        status: "PENDING",
        allowancePeriodId: wPeriod.id,
        createdById: waller.id,
      },
    });
    // Audit fixture: a dedicated employee + one PENDING request for audit.spec to approve.
    const auditor = await db.employee.upsert({
      where: { email: AUDIT_EMAIL },
      update: { status: "ACTIVE" },
      create: { email: AUDIT_EMAIL, firstName: "Aud", lastName: "Itor", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" },
    });
    let aPeriod = await db.allowancePeriod.findFirst({ where: { employeeId: auditor.id, endDate: null } });
    if (!aPeriod) {
      aPeriod = await db.allowancePeriod.create({ data: { employeeId: auditor.id, regionId: uae.id, startDate: day("2026-01-01"), opening: 26 } });
    }
    await db.auditEvent.deleteMany({ where: { entity: "LeaveRequest", entityId: { in: (await db.leaveRequest.findMany({ where: { employeeId: auditor.id }, select: { id: true } })).map((r) => r.id) } } });
    await db.leaveRequest.deleteMany({ where: { employeeId: auditor.id } });
    await db.leaveRequest.create({
      data: { employeeId: auditor.id, leaveTypeId: vacation.id, startDate: day(AUDIT_DATE), endDate: day(AUDIT_DATE), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", allowancePeriodId: aPeriod.id, createdById: auditor.id, notes: AUDIT_NOTE },
    });
  } finally {
    await db.$disconnect();
  }
}
