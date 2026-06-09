// CSV export of the wall chart (Epic 6.4). Reflects the same month + grouping/filters as
// the page (read from the query string). Auth-guarded via withAuth → 401/403 otherwise.
import { buildWallChartCsv, getWallChart, type WallChartOptions } from "@/lib/wallchart";
import { withAuth } from "@/lib/rbac";
import type { GroupBy, SortBy } from "@/core/wallchart";

function dubaiNow() {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) };
}

export const GET = withAuth(async (req) => {
  const sp = new URL(req.url).searchParams;
  const now = dubaiNow();
  const y = Number(sp.get("y"));
  const m = Number(sp.get("m"));
  const year = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : now.y;
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.m;

  const group = sp.get("group");
  const opts: WallChartOptions = {
    groupBy: (["none", "department", "region", "tag"] as const).includes(group as GroupBy) ? (group as GroupBy) : "none",
    type: sp.get("type") ?? "",
    name: sp.get("name") ?? "",
    sort: sp.get("sort") === "department" ? ("department" as SortBy) : ("name" as SortBy),
  };

  const data = await getWallChart(year, month, opts);
  const csv = buildWallChartCsv(data);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wall-chart-${year}-${String(month).padStart(2, "0")}.csv"`,
    },
  });
});
