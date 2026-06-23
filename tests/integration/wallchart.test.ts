// Integration tests for wall-chart assembly (Epic 6.1/6.5) against a real Postgres:
// correct cells per status, region weekends as "off", wall-chart visibility honoured, and
// the privacy guarantee that notes never reach the rendered data. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWallChartCsv, getWallChart } from "@/lib/wallchart";
import { categoryShortCode, leaveCategory } from "@/core/leave-categories";
import type { Actor } from "@/core/types";
import { db } from "@/lib/db";

// Two viewers (Epic 19.7 / decision #5). HR sees the REAL leave type everywhere; a non-HR
// teammate must only ever receive the four abstracted CATEGORIES — the specific type code,
// name and colour must never reach their client payload (enforced server-side).
const HR: Actor = { employeeId: "hr-test", role: "HR", approverLevel: "NONE", status: "ACTIVE", approverForIds: [] };
const STAFF: Actor = { employeeId: "staff-test", role: "STAFF", approverLevel: "NONE", status: "ACTIVE", approverForIds: [] };

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
// A deliberately identifiable type NAME + COLOUR for the seeded visible type — a non-HR
// payload must contain NEITHER (the four-category abstraction hides the specific identity).
const VISIBLE_NAME = "WC Sensitive Personal Reason";
const VISIBLE_COLOR = "#123456";
const CATEGORY_CODE = categoryShortCode(leaveCategory(VISIBLE)); // "WCV" → Out → "OUT"

let employeeId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

suite("Wall chart assembly (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [VISIBLE, HIDDEN] } } });

    const visible = await db.leaveType.create({ data: { name: VISIBLE_NAME, code: VISIBLE, color: VISIBLE_COLOR, visibleOnWallChart: true } });
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

  it("builds region-aware cells: approved, pending, weekend off, hidden type excluded (HR)", async () => {
    const data = await getWallChart(2026, 6, HR);
    const row = data.rows.find((r) => r.employeeId === employeeId)!;
    expect(row).toBeTruthy();
    const cell = (iso: string) => row.cells.find((c) => c.iso === iso)!;

    expect(cell("2026-06-15").kind).toBe("approved");
    expect(cell("2026-06-15").code).toBe(VISIBLE); // HR sees the REAL code
    expect(cell("2026-06-15").color).toBe(VISIBLE_COLOR); // and the REAL colour
    expect(cell("2026-06-17").kind).toBe("pending");
    expect(cell("2026-06-13").kind).toBe("off"); // Saturday
    expect(cell("2026-06-18").kind).toBe("none"); // hidden leave type — not shown
  });

  it("HR legend includes the real visible type, not the hidden one", async () => {
    const data = await getWallChart(2026, 6, HR);
    const codes = data.legend.map((l) => l.code);
    expect(codes).toContain(VISIBLE);
    expect(codes).not.toContain(HIDDEN);
    expect(data.legend.some((l) => l.name === VISIBLE_NAME)).toBe(true);
  });

  // ─── Epic 19.7 PRIVACY PROOF: the non-HR payload carries ONLY categories ───────────
  it("NON-HR cells show the category short code, never the specific type code", async () => {
    const data = await getWallChart(2026, 6, STAFF);
    const row = data.rows.find((r) => r.employeeId === employeeId)!;
    const cell = (iso: string) => row.cells.find((c) => c.iso === iso)!;

    // Same shape (approved/pending/off) preserved, but the cell label is the CATEGORY.
    expect(cell("2026-06-15").kind).toBe("approved");
    expect(cell("2026-06-15").code).toBe(CATEGORY_CODE);
    expect(cell("2026-06-15").code).not.toBe(VISIBLE);
    expect(cell("2026-06-17").kind).toBe("pending");
    expect(cell("2026-06-17").code).toBe(CATEGORY_CODE);
    // Colour stays a real hex (so letterColorToken still works) but NOT the type's hex.
    expect(cell("2026-06-15").color).toMatch(/^#?[0-9a-fA-F]{6}$/);
    expect(cell("2026-06-15").color).not.toBe(VISIBLE_COLOR);
  });

  it("NON-HR legend is the four categories, with no real type name/code, and types[] is empty", async () => {
    const data = await getWallChart(2026, 6, STAFF);
    const codes = data.legend.map((l) => l.code);
    expect(codes).toContain(CATEGORY_CODE);
    expect(codes).not.toContain(VISIBLE);
    expect(data.legend.some((l) => l.name === VISIBLE_NAME)).toBe(false);
    expect(data.types).toEqual([]); // leave-type filter source removed for non-HR
  });

  it("PRIVACY: the serialized NON-HR payload contains NO specific type identity", async () => {
    const data = await getWallChart(2026, 6, STAFF);
    const json = JSON.stringify(data);
    expect(json).not.toContain(SECRET); // notes never leak (6.5)
    expect(json).not.toContain(VISIBLE_NAME); // the personal type NAME never leaks
    expect(json).not.toContain(VISIBLE_COLOR); // nor its distinct colour
    expect(json).not.toContain(VISIBLE); // nor its specific code
  });

  it("PRIVACY: notes never reach the rendered HR data either (6.5)", async () => {
    const data = await getWallChart(2026, 6, HR);
    expect(JSON.stringify(data)).not.toContain(SECRET);
  });

  it("CSV export (HR) reflects the chart and never includes notes (6.4/6.5)", async () => {
    const csv = buildWallChartCsv(await getWallChart(2026, 6, HR));
    expect(csv.split("\r\n")[0]).toMatch(/^Employee,Department,Region,1,/);
    expect(csv).toContain("Wall Chart"); // the seeded employee's name (Wall Chart) appears in a body row
    expect(csv).toContain(VISIBLE); // the approved REAL code appears in a day column for HR
    expect(csv).not.toContain(SECRET);
  });

  it("navigation metadata wraps months correctly", async () => {
    const dec = await getWallChart(2026, 12, HR);
    expect(dec.next).toEqual({ y: 2027, m: 1 });
    const jan = await getWallChart(2026, 1, HR);
    expect(jan.prev).toEqual({ y: 2025, m: 12 });
  });
});
