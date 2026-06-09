import type { DonutSegment } from "@/core/allowance";

// Allowance donut (Epic 8.1). Arcs: Taken (charcoal), Pending (grey), Available (green) —
// per DESIGN-SYSTEM §5. Every arc is also labelled in the legend, so the breakdown is
// never distinguished by colour alone (AA). Pure SVG, tokens only.
const ARC_COLOR: Record<DonutSegment["key"], string> = {
  taken: "var(--donut-taken)",
  pending: "var(--status-pending-bg)",
  available: "var(--accent)",
};

export default function Donut({
  segments,
  total,
  available,
  unit = "days",
}: {
  segments: DonutSegment[];
  total: number;
  available: number;
  unit?: string;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const summary = segments.map((s) => `${s.label} ${s.value}`).join(", ");

  return (
    <div style={{ display: "flex", gap: "var(--space-5)", alignItems: "center", flexWrap: "wrap" }}>
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`Allowance: ${summary} of ${total} ${unit}.`}>
        {/* track */}
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
        {total > 0 &&
          segments.map((s) => {
            const len = s.fraction * c;
            const el = (
              <circle
                key={s.key}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={ARC_COLOR[s.key]}
                strokeWidth="16"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            );
            offset += len;
            return el;
          })}
        <text x="70" y="66" textAnchor="middle" className="t-num" style={{ fontSize: 22, fill: "var(--text)" }}>
          {available}
        </text>
        <text x="70" y="86" textAnchor="middle" style={{ fontSize: 11, fill: "var(--text-muted)" }}>
          available
        </text>
      </svg>

      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto auto", gap: "var(--space-1) var(--space-4)" }}>
        {segments.map((s) => (
          <div key={s.key} style={{ display: "contents" }}>
            <dt style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <i aria-hidden style={{ width: 12, height: 12, background: ARC_COLOR[s.key], display: "inline-block" }} />
              {s.label}
            </dt>
            <dd className="t-num" style={{ margin: 0, textAlign: "right" }}>{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
