// Epic 22.3 — PROOF that the wall chart issues a BOUNDED (constant) number of DB queries
// regardless of employee count, i.e. there is NO N+1 (no per-employee query). We seed a
// SMALL employee set and a LARGER one, count the `query` events Prisma emits while
// `getWallChart` runs for each, and assert the count does NOT grow with employee count.
// `getWallChart` does this via a fixed set of bulk findManys (employees + holidays(`in`) +
// leave + types) plus the PURE `buildRow` — never a query per employee. Self-skips without
// a DB like the other integration suites.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWallChart } from "@/lib/wallchart";
import type { Actor } from "@/core/types";
import { db } from "@/lib/db";

const HR: Actor = { employeeId: "hr-nplus1", role: "HR", approverLevel: "NONE", status: "ACTIVE", approverForIds: [] };
const STAFF: Actor = { employeeId: "staff-nplus1", role: "STAFF", approverLevel: "NONE", status: "ACTIVE", approverForIds: [] };

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[wallchart-nplus1.integration] DATABASE_URL unreachable — skipping integration suite.");

const PREFIX = "wc-n1-";
const TYPE_CODE = "WCN1";
const YEAR = 2026;
const MONTH = 6;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let typeId = "";
let regionId = "";

// Seed `count` ACTIVE employees starting at index `from`, each with one APPROVED leave
// inside the month. `from` keeps emails unique across additive seeding calls.
async function seedEmployees(count: number, from = 0): Promise<void> {
  for (let i = from; i < from + count; i++) {
    const emp = await db.employee.create({
      data: {
        email: `${PREFIX}${i}@interestingtimes.me`,
        firstName: "NPlus",
        lastName: `One${String(i).padStart(3, "0")}`,
        regionId,
        joiningDate: day("2024-01-01"),
        role: "STAFF",
      },
    });
    await db.leaveRequest.create({
      data: {
        employeeId: emp.id,
        leaveTypeId: typeId,
        startDate: day(`${YEAR}-0${MONTH}-15`),
        endDate: day(`${YEAR}-0${MONTH}-15`),
        durationMode: "DAY",
        workingDays: 1,
        allowanceDays: 1,
        status: "APPROVED",
        createdById: emp.id,
      },
    });
  }
}

async function clearSeeded(): Promise<void> {
  await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
  await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

// One persistent listener (Prisma has no `$off`), gated by a per-call `active` flag so we
// only attribute queries to the run we're measuring. Emitting as an EVENT is silent (no
// stdout), so this never adds console noise to the suite.
let counting = false;
let queryCount = 0;
db.$on("query", () => {
  if (counting) queryCount++;
});

async function countQueries<T>(fn: () => Promise<T>): Promise<number> {
  queryCount = 0;
  counting = true;
  try {
    await fn();
  } finally {
    counting = false;
  }
  return queryCount;
}

suite("Wall chart issues a bounded number of queries (no N+1) — Epic 22.3", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });
    regionId = uae.id;

    await clearSeeded();
    await db.leaveType.deleteMany({ where: { code: TYPE_CODE } });
    const type = await db.leaveType.create({
      data: { name: "WC NPlus1 Type", code: TYPE_CODE, color: "#2F6FEB", visibleOnWallChart: true },
    });
    typeId = type.id;
  });

  afterAll(async () => {
    await clearSeeded();
    await db.leaveType.deleteMany({ where: { code: TYPE_CODE } });
    await db.$disconnect();
  });

  it("query count does NOT grow with employee count (HR — full data path)", async () => {
    await clearSeeded();
    await seedEmployees(2);
    // Warm-up call so first-time connection/prepare work isn't counted in the asserted runs.
    await getWallChart(YEAR, MONTH, HR);
    const countSmall = await countQueries(() => getWallChart(YEAR, MONTH, HR));

    await seedEmployees(10, 2); // add 10 more (indices 2–11) → 12 total
    const countLarge = await countQueries(() => getWallChart(YEAR, MONTH, HR));

    // Bounded: the larger set must NOT cost more queries. An N+1 would make
    // countLarge ≈ countSmall + 10. Allow a tiny slack but nowhere near O(employees).
    expect(countLarge).toBeLessThanOrEqual(countSmall + 1);
    expect(countLarge - countSmall).toBeLessThan(6); // categorically not O(employees)
  });

  it("query count stays bounded for the non-HR (abstracted) path too", async () => {
    await clearSeeded();
    await seedEmployees(2);
    await getWallChart(YEAR, MONTH, STAFF); // warm-up
    const countSmall = await countQueries(() => getWallChart(YEAR, MONTH, STAFF));

    await seedEmployees(10, 2); // add 10 more (indices 2–11) → 12 total
    const countLarge = await countQueries(() => getWallChart(YEAR, MONTH, STAFF));

    expect(countLarge).toBeLessThanOrEqual(countSmall + 1);
    expect(countLarge - countSmall).toBeLessThan(6);
  });
});
