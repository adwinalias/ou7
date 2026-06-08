import { PrismaClient } from "@prisma/client";

// Reset the e2e user's leave so the happy-path spec is re-runnable (no overlap on a
// second run). Assumes the DB is seeded (npm run db:seed) with the HR bootstrap user.
export default async function globalSetup() {
  const db = new PrismaClient();
  try {
    await db.leaveRequest.deleteMany({
      where: { employee: { email: "adwin.alias@interestingtimes.me" } },
    });
  } finally {
    await db.$disconnect();
  }
}
