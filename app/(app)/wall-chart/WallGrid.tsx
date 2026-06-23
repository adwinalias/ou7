"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { letterColorToken, nextCell, type GridNavKey, type GridPos, type WallCell } from "@/core/wallchart";
import type { WallChartData, WallRow } from "@/lib/wallchart";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

// ≥40px touch targets (Epic 20.1 AC4 / v2 DoD). Day cells, the sticky name column and the
// header row all share this minimum so interactive cells clear the WCAG-AA touch bar.
const CELL_MIN = 40;

const nameCol: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 1,
  background: "var(--surface)",
  borderRight: "1px solid var(--border-strong)",
  padding: "0 var(--space-3)",
  display: "flex",
  alignItems: "center",
  minHeight: CELL_MIN,
  fontSize: "var(--text-sm)",
  whiteSpace: "nowrap",
};

// Stable id for the cell at (row, col). Row/col are 0-based: row 0 = header, col 0 = name.
const cellId = (prefix: string, row: number, col: number) => `${prefix}-r${row}-c${col}`;

// The active-cell focus ring (roving focus indicator). Tokens only; both themes.
const FOCUS_RING: React.CSSProperties = {
  outline: "2px solid var(--focus-ring)",
  outlineOffset: -2,
  // sit above the today ring / neighbour borders so the ring isn't clipped
  zIndex: 3,
  position: "relative",
};

function Cell({
  cell,
  name,
  id,
  colIndex,
  active,
}: {
  cell: WallCell;
  name: string;
  id: string;
  colIndex: number; // 1-based aria-colindex
  active: boolean;
}) {
  const todayRing = cell.today ? { outline: "2px solid var(--accent)", outlineOffset: -2 } : null;
  const common: React.CSSProperties = {
    minHeight: CELL_MIN,
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    display: "grid",
    placeItems: "center",
    ...todayRing,
    ...(active ? FOCUS_RING : null),
  };
  // Common ARIA-grid attributes carried by every day cell.
  const grid = { role: "gridcell" as const, id, "aria-colindex": colIndex, tabIndex: -1 };

  if (cell.kind === "off") {
    return (
      <div
        {...grid}
        className="cell cell--off"
        style={common}
        aria-label={`${cell.iso}: non-working`}
        title="Non-working day"
      />
    );
  }
  if (cell.kind === "none") {
    return <div {...grid} className="cell" style={common} aria-label={`${cell.iso}: available`} />;
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
        {...grid}
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
      {...grid}
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
  // Unique-per-instance prefix so cell ids are stable and collision-free on the page.
  const prefix = `wc-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const gridRef = useRef<HTMLDivElement>(null);

  // Flat ordered list of data rows (across groups) so coordinate math is group-agnostic
  // and aria-rowindex stays continuous. Each entry remembers its group for rowgroup labels.
  const flatRows = useMemo<WallRow[]>(() => data.groups.flatMap((g) => g.rows), [data.groups]);
  const rowCount = flatRows.length; // data rows only
  const colCount = n + 1; // name column (1) + day columns

  // Roving focus: the active cell coordinate (0-based; row 0 = first data row, col 0 = name).
  const [pos, setPos] = useState<GridPos>({ row: 0, col: 0 });
  const activeId = rowCount > 0 ? cellId(prefix, pos.row, pos.col) : undefined;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (rowCount === 0) return;
      let key: GridNavKey | null = null;
      switch (e.key) {
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown":
          key = e.key;
          break;
        case "Home":
          key = e.ctrlKey || e.metaKey ? "CtrlHome" : "Home";
          break;
        case "End":
          key = e.ctrlKey || e.metaKey ? "CtrlEnd" : "End";
          break;
        default:
          return;
      }
      e.preventDefault();
      const next = nextCell(pos, key, rowCount, colCount);
      if (next.row === pos.row && next.col === pos.col) return;
      setPos(next);
      // Scroll the newly active cell into view (block/inline nearest keeps the page still).
      const el = gridRef.current?.querySelector<HTMLElement>(`#${CSS.escape(cellId(prefix, next.row, next.col))}`);
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [pos, rowCount, colCount, prefix],
  );

  if (data.rows.length === 0) {
    return (
      <section className="card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
        <p className="t-editorial" style={{ fontSize: "var(--text-h2)" }}>No one on the chart yet.</p>
      </section>
    );
  }

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
    minHeight: CELL_MIN,
  });

  // Running 0-based index into the flat data rows, used to assign continuous coordinates
  // and 1-based aria-rowindex (header = 1, first data row = 2, …) across group boundaries.
  let dataRowIdx = 0;

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)" }} data-testid="wall-chart">
      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        aria-label={`Team calendar, ${data.monthLabel}`}
        aria-rowcount={rowCount + 1}
        aria-colcount={colCount}
        aria-activedescendant={activeId}
        onKeyDown={onKeyDown}
        style={{
          display: "grid",
          gridTemplateColumns: `180px repeat(${n}, minmax(${CELL_MIN}px, 1fr))`,
          minWidth: "fit-content",
          // The grid uses the aria-activedescendant pattern: the visible green focus
          // indicator is the active cell's FOCUS_RING (always rendered), not a ring on the
          // container. Suppressing the container outline here avoids a doubled/misplaced
          // ring — focus remains visible everywhere (Epic 20.4 AC2).
          outline: "none",
        }}
      >
        {/* Header row (aria-rowindex 1) */}
        <div role="row" aria-rowindex={1} style={{ display: "contents" }}>
          <div
            role="columnheader"
            aria-colindex={1}
            style={{ ...nameCol, ...headerCell(false), zIndex: 2 }}
            className="t-label"
          >
            Team
          </div>
          {data.days.map((d, i) => {
            const today = d.iso === data.todayISO;
            return (
              <div key={d.iso} role="columnheader" aria-colindex={i + 2} style={headerCell(today)} aria-label={d.iso}>
                <div className="t-muted">{WEEKDAY[d.weekday]}</div>
                <div style={{ fontWeight: today ? 700 : 400 }}>{d.day}</div>
              </div>
            );
          })}
        </div>

        {/* Rows, optionally grouped (6.2). Each group is a rowgroup; data rows keep a
            continuous aria-rowindex regardless of group header rows. */}
        {data.groups.map((group) => (
          <div
            key={group.key}
            role="rowgroup"
            aria-label={data.options.groupBy !== "none" ? group.label : undefined}
            style={{ display: "contents" }}
          >
            {data.options.groupBy !== "none" && (
              <div role="presentation" style={{ display: "contents" }}>
                <div
                  className="t-label"
                  style={{
                    gridColumn: "1 / -1",
                    position: "sticky",
                    left: 0,
                    background: "var(--surface-2)",
                    borderBottom: "1px solid var(--border-strong)",
                    padding: "var(--space-2) var(--space-3)",
                  }}
                >
                  {group.label} · {group.rows.length}
                </div>
              </div>
            )}
            {group.rows.map((row) => {
              const r = dataRowIdx++;
              const ariaRow = r + 2; // header is 1
              const nameCellId = cellId(prefix, r, 0);
              const nameActive = pos.row === r && pos.col === 0;
              return (
                <div key={`${group.key}-${row.employeeId}`} role="row" aria-rowindex={ariaRow} style={{ display: "contents" }}>
                  <div
                    role="rowheader"
                    id={nameCellId}
                    aria-colindex={1}
                    tabIndex={-1}
                    style={{ ...nameCol, ...(nameActive ? FOCUS_RING : null) }}
                    title={`${row.name} · ${row.regionName}`}
                  >
                    {row.name}
                  </div>
                  {row.cells.map((cell, ci) => (
                    <Cell
                      key={cell.iso}
                      cell={cell}
                      name={row.name}
                      id={cellId(prefix, r, ci + 1)}
                      colIndex={ci + 2}
                      active={pos.row === r && pos.col === ci + 1}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
