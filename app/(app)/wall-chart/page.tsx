import { getWallChart, type WallChartOptions } from "@/lib/wallchart";
import { requireUser } from "@/lib/rbac";
import type { GroupBy, SortBy } from "@/core/wallchart";
import PrintButton from "./PrintButton";
import WallGrid from "./WallGrid";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "Company" },
  { value: "department", label: "Department" },
  { value: "region", label: "Region" },
  { value: "tag", label: "Tag" },
];
const SORTS: { value: SortBy; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "department", label: "Department" },
];

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

function href(y: number, m: number, o: Required<WallChartOptions>) {
  const q = new URLSearchParams({ y: String(y), m: String(m), group: o.groupBy, sort: o.sort });
  if (o.type) q.set("type", o.type);
  if (o.name) q.set("name", o.name);
  return `/wall-chart?${q.toString()}`;
}

export default async function WallChartPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string; group?: string; type?: string; name?: string; sort?: string }>;
}) {
  await requireUser(); // team view: any active employee may see it
  const sp = await searchParams;
  const { year, month } = clampMonth(Number(sp.y), Number(sp.m));

  const opts: WallChartOptions = {
    groupBy: (["none", "department", "region", "tag"] as const).includes(sp.group as GroupBy) ? (sp.group as GroupBy) : "none",
    type: sp.type ?? "",
    name: sp.name ?? "",
    sort: sp.sort === "department" ? "department" : "name",
  };
  const data = await getWallChart(year, month, opts);
  const o = data.options;
  const years = Array.from({ length: 5 }, (_, i) => year - 2 + i);

  return (
    <div>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Team Calendar</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>
        Who&apos;s off, at a glance. Approved leave is a solid block; pending is grey with a coloured bar.
      </p>

      {/* Navigation (6.3) — Prev/Next preserve the current grouping/filters. */}
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
        <a className="btn btn-secondary" href={href(data.prev.y, data.prev.m, o)} data-testid="wc-prev">← Prev</a>
        <strong className="t-num" data-testid="wc-month" style={{ minWidth: 160, textAlign: "center" }}>{data.monthLabel}</strong>
        <a className="btn btn-secondary" href={href(data.next.y, data.next.m, o)} data-testid="wc-next">Next →</a>
        <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
          <a className="btn btn-secondary" href={`/wall-chart/export?${href(year, month, o).split("?")[1]}`} data-testid="wc-export">Export CSV</a>
          <PrintButton />
        </div>
      </div>

      {/* Controls (6.2 + 6.3): one GET form carries month/year, grouping, filters, sort. */}
      <form
        method="get"
        action="/wall-chart"
        className="no-print"
        style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "end", marginBottom: "var(--space-4)" }}
      >
        <Field label="Month" htmlFor="m">
          <select id="m" name="m" className="input" defaultValue={month}>
            {MONTHS.map((label, i) => (
              <option key={label} value={i + 1}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Year" htmlFor="y">
          <select id="y" name="y" className="input" defaultValue={year}>
            {years.map((yy) => (
              <option key={yy} value={yy}>{yy}</option>
            ))}
          </select>
        </Field>
        <Field label="Group by" htmlFor="group">
          <select id="group" name="group" className="input" defaultValue={o.groupBy} data-testid="wc-group">
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Leave type" htmlFor="type">
          <select id="type" name="type" className="input" defaultValue={o.type} data-testid="wc-type">
            <option value="">All types</option>
            {data.types.map((t) => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Sort by" htmlFor="sort">
          <select id="sort" name="sort" className="input" defaultValue={o.sort}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" className="input" defaultValue={o.name} placeholder="Filter…" data-testid="wc-name" />
        </Field>
        <button type="submit" className="btn btn-primary">Apply</button>
      </form>

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

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <label htmlFor={htmlFor} className="t-label">{label}</label>
      {children}
    </div>
  );
}
