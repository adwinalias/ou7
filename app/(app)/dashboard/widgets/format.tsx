// Shared presentational helpers for the dashboard widgets (Epic 21.2). Extracted verbatim
// from the old page.tsx so widget markup/testids are byte-for-byte unchanged. Tokens only.
import { letterColorToken, type WallCell } from "@/core/wallchart";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

/** Short, region-neutral day label, e.g. "Mon 23 Jun". */
export function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function weekdayInitial(iso: string) {
  return WEEKDAY[new Date(`${iso}T00:00:00.000Z`).getUTCDay()];
}

export function DayCell({ cell }: { cell: WallCell }) {
  const base: React.CSSProperties = {
    minHeight: 40,
    border: "1px solid var(--border)",
    display: "grid",
    placeItems: "center",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    ...(cell.today ? { outline: "2px solid var(--accent)", outlineOffset: -2 } : {}),
  };
  if (cell.kind === "off") return <div className="cell--off" style={base} title="Non-working" aria-label="non-working" />;
  if (cell.kind === "none") return <div style={base} aria-label="available" />;
  const label = `${cell.half ? "½" : ""}${cell.code ?? ""}`;
  if (cell.kind === "approved") {
    const fg = letterColorToken(cell.color!) === "ink" ? "var(--ink)" : "var(--paper)";
    return <div style={{ ...base, background: cell.color, color: fg, fontWeight: 600 }} aria-label={`${cell.code} approved`}>{label}</div>;
  }
  return (
    <div className="cell--pending" style={{ ...base, ["--cell-lt" as string]: cell.color }} aria-label={`${cell.code} pending`}>
      {label}
    </div>
  );
}
