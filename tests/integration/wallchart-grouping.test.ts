// Integration tests for wall-chart grouping/filtering/sorting (Epic 6.2). Isolated from
// the 6.1 suite via its own prefix. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWallChart } from "@/lib/wallchart";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[wallchart-grouping.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "wcg-it-";
const TYPE = "WCGV";
const DEPT_ENG = "WCG Eng";
const DEPT_OPS = "WCG Ops";
const TAG = "wcg-lead";

let aId = "";
let bId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

suite("Wall chart grouping/filter/sort (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.department.deleteMany({ where: { name: { in: [DEPT_ENG, DEPT_OPS] } } });
    await db.tag.deleteMany({ where: { name: TAG } });

    const eng = await db.department.create({ data: { name: DEPT_ENG } });
    const ops = await db.department.create({ data: { name: DEPT_OPS } });
    const tag = await db.tag.create({ data: { name: TAG } });
    const type = await db.leaveType.create({ data: { name: "WCG Vacation", code: TYPE, color: "#2F6FEB", visibleOnWallChart: true } });

    aId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}aaron@interestingtimes.me`,
          firstName: "Aaron",
          lastName: "Grouptest",
          regionId: uae.id,
          joiningDate: day("2024-01-01"),
          role: "STAFF",
          departmentId: eng.id,
          tags: { connect: { id: tag.id } },
        },
      })
    ).id;
    bId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}bella@interestingtimes.me`,
          firstName: "Bella",
          lastName: "Grouptest",
          regionId: uae.id,
          joiningDate: day("2024-01-01"),
          role: "STAFF",
          departmentId: ops.id,
        },
      })
    ).id;

    await db.leaveRequest.create({
      data: { employeeId: aId, leaveTypeId: type.id, startDate: day("2026-06-15"), endDate: day("2026-06-15"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "APPROVED", createdById: aId },
    });
    await db.leaveRequest.create({
      data: { employeeId: bId, leaveTypeId: type.id, startDate: day("2026-06-15"), endDate: day("2026-06-15"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", createdById: bId },
    });
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.department.deleteMany({ where: { name: { in: [DEPT_ENG, DEPT_OPS] } } });
    await db.tag.deleteMany({ where: { name: TAG } });
    await db.$disconnect();
  });

  it("groups by department", async () => {
    const data = await getWallChart(2026, 6, { groupBy: "department" });
    const eng = data.groups.find((g) => g.label === DEPT_ENG)!;
    const ops = data.groups.find((g) => g.label === DEPT_OPS)!;
    expect(eng.rows.some((r) => r.employeeId === aId)).toBe(true);
    expect(ops.rows.some((r) => r.employeeId === bId)).toBe(true);
  });

  it("groups by tag (untagged employee not under the tag)", async () => {
    const data = await getWallChart(2026, 6, { groupBy: "tag" });
    const lead = data.groups.find((g) => g.label === TAG)!;
    expect(lead.rows.some((r) => r.employeeId === aId)).toBe(true);
    expect(lead.rows.some((r) => r.employeeId === bId)).toBe(false);
  });

  it("filters by employee name", async () => {
    const data = await getWallChart(2026, 6, { name: "Aaron Grouptest" });
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]!.employeeId).toBe(aId);
  });

  it("filters by leave type (legend reflects only that type)", async () => {
    const data = await getWallChart(2026, 6, { type: TYPE });
    expect(data.legend.map((l) => l.code)).toEqual([TYPE]);
  });

  it("sorts by name (Aaron before Bella)", async () => {
    const names = (await getWallChart(2026, 6, { sort: "name" })).rows.map((r) => r.name);
    expect(names.indexOf("Aaron Grouptest")).toBeLessThan(names.indexOf("Bella Grouptest"));
  });
});
