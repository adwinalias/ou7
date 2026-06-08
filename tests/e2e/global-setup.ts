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

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export default async function globalSetup() {
  const db = new PrismaClient();
  try {
    const uae = await db.region.findFirstOrThrow({ where: { name: "UAE" } });
    const vacation = await db.leaveType.findFirstOrThrow({ where: { code: "V" } });

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
  } finally {
    await db.$disconnect();
  }
}
