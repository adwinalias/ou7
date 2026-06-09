import { letterColorToken, type WallCell } from "@/core/wallchart";
import type { WallChartData } from "@/lib/wallchart";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

const nameCol: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 1,
  background: "var(--surface)",
  borderRight: "1px solid var(--border-strong)",
  padding: "0 var(--space-3)",
  display: "flex",
  alignItems: "center",
  minHeight: 32,
  fontSize: "var(--text-sm)",
  whiteSpace: "nowrap",
};

function Cell({ cell, name }: { cell: WallCell; name: string }) {
  const todayRing = cell.today ? { outline: "2px solid var(--accent)", outlineOffset: -2 } : null;
  const common: React.CSSProperties = {
    minHeight: 32,
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    display: "grid",
    placeItems: "center",
    ...todayRing,
  };

  if (cell.kind === "off") {
    return (
      <div
        className="cell cell--off"
        style={common}
        aria-label={`${cell.iso}: non-working`}
        title="Non-working day"
      />
    );
  }
  if (cell.kind === "none") {
    return <div style={common} aria-label={`${cell.iso}: available`} />;
  }

  const label = `${cell.half ? "½" : ""}${cell.code}`;
  const aria = `${name}: ${cell.code}${cell.half ? ` half day ${cell.half}` : ""}, ${cell.iso}, ${cell.kind}`;

  if (cell.kind === "approved") {
    const fg = letterColorToken(cell.color!) === "ink" ? "var(--ink)" : "var(--paper)";
    // Half days render as a functional half-fill (allowed gradient): AM = left, PM = right.
    const half =
      cell.half === "AM"
        ? `linear-gradient(to right, ${cell.color} 50%, var(--surface) 50%)`
        : cell.half === "PM"
          ? `linear-gradient(to left, ${cell.color} 50%, var(--surface) 50%)`
          : undefined;
    return (
      <div
        className="cell cell--approved"
        data-testid="leave-cell"
        style={{ ...common, background: half ?? cell.color, color: fg, fontWeight: 600 }}
        aria-label={aria}
        title={aria}
      >
        {label}
      </div>
    );
  }

  // pending — grey fill + coloured left bar (the type), letter in body text colour.
  return (
    <div
      className="cell cell--pending"
      data-testid="leave-cell"
      style={{ ...common, ["--cell-lt" as string]: cell.color }}
      aria-label={aria}
      title={aria}
    >
      {label}
    </div>
  );
}

export default function WallGrid({ data }: { data: WallChartData }) {
  const n = data.days.length;
  const headerCell = (today: boolean): React.CSSProperties => ({
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: today ? "var(--accent-quiet)" : "var(--surface-2)",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border-strong)",
    padding: "var(--space-1) 0",
    textAlign: "center",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    minHeight: 32,
  });

  if (data.rows.length === 0) {
    return (
      <section className="card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
        <p className="t-editorial" style={{ fontSize: "var(--text-h2)" }}>No one on the chart yet.</p>
      </section>
    );
  }

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)" }} data-testid="wall-chart">
      <div style={{ display: "grid", gridTemplateColumns: `180px repeat(${n}, minmax(30px, 1fr))`, minWidth: "fit-content" }}>
        {/* Header */}
        <div style={{ ...nameCol, ...headerCell(false), zIndex: 2 }} className="t-label">Team</div>
        {data.days.map((d) => {
          const today = d.iso === data.todayISO;
          return (
            <div key={d.iso} style={headerCell(today)} aria-label={d.iso}>
              <div className="t-muted">{WEEKDAY[d.weekday]}</div>
              <div style={{ fontWeight: today ? 700 : 400 }}>{d.day}</div>
            </div>
          );
        })}

        {/* Rows */}
        {data.rows.map((row) => (
          <div key={row.employeeId} style={{ display: "contents" }}>
            <div style={nameCol} title={`${row.name} · ${row.regionName}`}>{row.name}</div>
            {row.cells.map((cell) => (
              <Cell key={cell.iso} cell={cell} name={row.name} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
