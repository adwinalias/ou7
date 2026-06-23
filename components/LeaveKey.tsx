import { LEAVE_CATEGORIES, categoryColorVar } from "@/core/leave-categories";

// Shared category + status key (Epic 19.1, decision #5). ONE reusable key reused on every
// calendar surface (Team Calendar 19.1/19.7, dashboard tiles 18.5) so changing it updates
// all surfaces. Presentational only — data comes via props; tokens only (no hard-coded hex).
//
// Two modes:
//   - "categories": the FOUR abstracted public categories (Out · Sick (non-working) ·
//     Sick (WFH) · National Holiday), coloured from the single core source. Used on
//     shared/company-wide surfaces where the specific personal type must not leak.
//   - "types": a passed-in list of REAL {code,name,color} leave types. Used in
//     owner/approver/HR contexts that may see the real type.
//
// Every mode also draws the shared status swatches the key now owns: pending (grey cell +
// coloured left bar, per DESIGN-SYSTEM §2) and weekend/holiday (faint hairlines, .cell--off).
// Swatch glyphs are aria-hidden; every entry carries a visible text label (never colour-only).

export type LeaveType = { code: string; name: string; color: string };

type Props =
  | { mode: "categories"; types?: never; testid?: string }
  | { mode: "types"; types: LeaveType[]; testid?: string };

const wrap: React.CSSProperties = {
  display: "flex",
  gap: "var(--space-5)",
  flexWrap: "wrap",
  fontSize: "var(--text-sm)",
};
const entry: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6 };
const swatch: React.CSSProperties = { width: 14, height: 14, flex: "0 0 auto" };

/** Approved swatch: solid leave-type / category fill with a hairline border. */
function ApprovedSwatch({ color }: { color: string }) {
  return <i aria-hidden style={{ ...swatch, background: color, border: "1px solid var(--border)" }} />;
}

export default function LeaveKey(props: Props) {
  const { mode, testid = "leave-key" } = props;

  const items =
    mode === "categories"
      ? LEAVE_CATEGORIES.map((c) => ({ key: c, label: c, color: categoryColorVar(c) }))
      : props.types.map((t) => ({ key: t.code, label: `${t.name} (${t.code})`, color: t.color }));

  return (
    <div style={wrap} data-testid={testid}>
      {items.map((it) => (
        <span key={it.key} style={entry}>
          <ApprovedSwatch color={it.color} />
          {it.label}
        </span>
      ))}
      {/* Pending: grey cell + coloured left bar (DESIGN-SYSTEM §2). */}
      <span style={entry} data-testid="leave-key-pending">
        <i
          aria-hidden
          style={{ ...swatch, background: "var(--status-pending-bg)", borderLeft: "3px solid var(--border-strong)" }}
        />
        Pending
      </span>
      {/* Weekend / holiday: faint hairlines, never grey. */}
      <span style={entry} data-testid="leave-key-off">
        <i aria-hidden className="cell--off" style={{ ...swatch, border: "1px solid var(--border)" }} />
        Weekend / holiday
      </span>
    </div>
  );
}
