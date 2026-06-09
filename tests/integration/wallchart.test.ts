// Integration tests for wall-chart assembly (Epic 6.1/6.5) against a real Postgres:
// correct cells per status, region weekends as "off", wall-chart visibility honoured, and
// the privacy guarantee that notes never reach the rendered data. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWallChartCsv, getWallChart } from "@/lib/wallchart";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[wallchart.integration] DATABASE_URL unreachable — skipping integration suite.");

const PREFIX = "wc-it-";
const VISIBLE = "WCV";
const HIDDEN = "WCH";
const SECRET = "SECRET-NOTE-12345";

let employeeId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

suite("Wall chart assembly (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [VISIBLE, HIDDEN] } } });

    const visible = await db.leaveType.create({ data: { name: "WC Vacation", code: VISIBLE, color: "#2F6FEB", visibleOnWallChart: true } });
    const hidden = await db.leaveType.create({ data: { name: "WC Hidden", code: HIDDEN, color: "#B58900", visibleOnWallChart: false } });

    employeeId = (
      await db.employee.create({
        data: { email: `${PREFIX}staff@interestingtimes.me`, firstName: "Wall", lastName: "Chart", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" },
      })
    ).id;

    const mk = (typeId: string, startISO: string, status: "APPROVED" | "PENDING", notes?: string) =>
      db.leaveRequest.create({
        data: {
          employeeId,
          leaveTypeId: typeId,
          startDate: day(startISO),
          endDate: day(startISO),
          durationMode: "DAY",
          workingDays: 1,
          allowanceDays: 1,
          status,
          notes: notes ?? null,
          createdById: employeeId,
        },
      });

    await mk(visible.id, "2026-06-15", "APPROVED", SECRET); // Mon — note must NOT leak
    await mk(visible.id, "2026-06-17", "PENDING"); // Wed
    await mk(hidden.id, "2026-06-18", "APPROVED"); // Thu — hidden type, must not render
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [VISIBLE, HIDDEN] } } });
    await db.$disconnect();
  });

  it("builds region-aware cells: approved, pending, weekend off, hidden type excluded", async () => {
    const data = await getWallChart(2026, 6);
    const row = data.rows.find((r) => r.employeeId === employeeId)!;
    expect(row).toBeTruthy();
    const cell = (iso: string) => row.cells.find((c) => c.iso === iso)!;

    expect(cell("2026-06-15").kind).toBe("approved");
    expect(cell("2026-06-15").code).toBe(VISIBLE);
    expect(cell("2026-06-17").kind).toBe("pending");
    expect(cell("2026-06-13").kind).toBe("off"); // Saturday
    expect(cell("2026-06-18").kind).toBe("none"); // hidden leave type — not shown
  });

  it("legend includes the visible type, not the hidden one", async () => {
    const codes = (await getWallChart(2026, 6)).legend.map((l) => l.code);
    expect(codes).toContain(VISIBLE);
    expect(codes).not.toContain(HIDDEN);
  });

  it("PRIVACY: notes never reach the rendered data (6.5)", async () => {
    const data = await getWallChart(2026, 6);
    expect(JSON.stringify(data)).not.toContain(SECRET);
  });

  it("CSV export reflects the chart and never includes notes (6.4/6.5)", async () => {
    const csv = buildWallChartCsv(await getWallChart(2026, 6));
    expect(csv.split("\r\n")[0]).toMatch(/^Employee,Department,Region,1,/);
    expect(csv).toContain("Wall Chart");
    expect(csv).toContain(VISIBLE); // the approved code appears in a day column
    expect(csv).not.toContain(SECRET);
  });

  it("navigation metadata wraps months correctly", async () => {
    const dec = await getWallChart(2026, 12);
    expect(dec.next).toEqual({ y: 2027, m: 1 });
    const jan = await getWallChart(2026, 1);
    expect(jan.prev).toEqual({ y: 2025, m: 12 });
  });
});
