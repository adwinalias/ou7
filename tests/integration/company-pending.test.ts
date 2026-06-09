// Integration tests for the company pending queue (Epic 9.6): org-wide PENDING list with
// time-in-pending + name/department filters. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listCompanyPending } from "@/lib/approvals";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[company-pending.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "cp-it-";
const TYPE = "CPV";
let engId = "";
let opsId = "";
let aliceId = "";
let bobId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

suite("Company pending queue (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.department.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });

    engId = (await db.department.create({ data: { name: `${PREFIX}Eng` } })).id;
    opsId = (await db.department.create({ data: { name: `${PREFIX}Ops` } })).id;
    const type = await db.leaveType.create({ data: { name: "CP Vacation", code: TYPE, color: "#2F6FEB", deductsAllowance: true } });

    aliceId = (await db.employee.create({ data: { email: `${PREFIX}alice@interestingtimes.me`, firstName: "Alice", lastName: "CP", regionId: uae.id, departmentId: engId, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    bobId = (await db.employee.create({ data: { email: `${PREFIX}bob@interestingtimes.me`, firstName: "Bob", lastName: "CP", regionId: uae.id, departmentId: opsId, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;

    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
    await db.leaveRequest.create({ data: { employeeId: aliceId, leaveTypeId: type.id, startDate: day("2026-06-01"), endDate: day("2026-06-01"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", createdById: aliceId, createdAt: fiveDaysAgo } });
    await db.leaveRequest.create({ data: { employeeId: bobId, leaveTypeId: type.id, startDate: day("2026-06-02"), endDate: day("2026-06-02"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "PENDING", createdById: bobId } });
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.department.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.$disconnect();
  });

  it("lists pending org-wide with time-in-pending", async () => {
    const all = await listCompanyPending();
    const alice = all.find((r) => r.requesterName === "Alice CP")!;
    const bob = all.find((r) => r.requesterName === "Bob CP")!;
    expect(alice).toBeTruthy();
    expect(bob).toBeTruthy();
    expect(alice.daysPending).toBeGreaterThanOrEqual(5);
    expect(bob.daysPending).toBe(0);
    expect(alice.departmentName).toBe(`${PREFIX}Eng`);
  });

  it("filters by name", async () => {
    const res = await listCompanyPending({ name: "Alice CP" });
    expect(res.every((r) => r.requesterName === "Alice CP")).toBe(true);
    expect(res.length).toBe(1);
  });

  it("filters by department", async () => {
    const res = await listCompanyPending({ departmentId: opsId });
    expect(res.some((r) => r.requesterName === "Bob CP")).toBe(true);
    expect(res.some((r) => r.requesterName === "Alice CP")).toBe(false);
  });
});
