import { getWallChart } from "@/lib/wallchart";
import { requireUser } from "@/lib/rbac";
import WallGrid from "./WallGrid";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dubaiNow() {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) };
}

function clampMonth(y: number, m: number) {
  const now = dubaiNow();
  const year = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : now.y;
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.m;
  return { year, month };
}

export default async function WallChartPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  await requireUser(); // team view: any active employee may see it
  const sp = await searchParams;
  const { year, month } = clampMonth(Number(sp.y), Number(sp.m));
  const data = await getWallChart(year, month);

  const years = Array.from({ length: 5 }, (_, i) => year - 2 + i);

  return (
    <div>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Team wall chart</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>
        Who&apos;s off, at a glance. Approved leave is a solid block; pending is grey with a coloured bar.
      </p>

      {/* Navigation (6.3): Prev/Next + month/year selectors (GET form, no JS needed). */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <a className="btn btn-secondary" href={`/wall-chart?y=${data.prev.y}&m=${data.prev.m}`} data-testid="wc-prev">← Prev</a>
        <strong className="t-num" data-testid="wc-month" style={{ minWidth: 160, textAlign: "center" }}>{data.monthLabel}</strong>
        <a className="btn btn-secondary" href={`/wall-chart?y=${data.next.y}&m=${data.next.m}`} data-testid="wc-next">Next →</a>

        <form method="get" action="/wall-chart" style={{ display: "flex", gap: "var(--space-2)", marginLeft: "auto" }}>
          <label htmlFor="m" className="t-label" style={{ alignSelf: "center" }}>Month</label>
          <select id="m" name="m" className="input" defaultValue={month}>
            {MONTHS.map((label, i) => (
              <option key={label} value={i + 1}>{label}</option>
            ))}
          </select>
          <label htmlFor="y" className="t-label" style={{ alignSelf: "center" }}>Year</label>
          <select id="y" name="y" className="input" defaultValue={year}>
            {years.map((yy) => (
              <option key={yy} value={yy}>{yy}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">Go</button>
        </form>
      </div>

      <WallGrid data={data} />

      {/* Legend */}
      <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", marginTop: "var(--space-4)", fontSize: "var(--text-sm)" }}>
        {data.legend.map((lt) => (
          <span key={lt.code} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i aria-hidden style={{ width: 14, height: 14, background: lt.color, border: "1px solid var(--border)" }} />
            {lt.name} ({lt.code})
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i aria-hidden style={{ width: 14, height: 14, background: "var(--status-pending-bg)", borderLeft: "3px solid var(--border-strong)" }} />
          Pending
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i aria-hidden className="cell--off" style={{ width: 14, height: 14, border: "1px solid var(--border)" }} />
          Weekend / holiday
        </span>
      </div>
    </div>
  );
}
