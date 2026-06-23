"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  letterColorToken,
  nextCell,
  windowRange,
  type GridNavKey,
  type GridPos,
  type WallCell,
} from "@/core/wallchart";
import type { WallChartData, WallRow } from "@/lib/wallchart";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

// ≥40px touch targets (Epic 20.1 AC4 / v2 DoD). Day cells, the sticky name column and the
// header row all share this minimum so interactive cells clear the WCAG-AA touch bar.
const CELL_MIN = 40;

// Row windowing (Epic 21.3). A rendered data row's height is CELL_MIN + 1px bottom border,
// so the uniform row pitch used for spacer sizing / window math is CELL_MIN + 1. OVERSCAN
// extra rows render on each side of the viewport to keep scroll smooth and avoid flashes.
const ROW_PITCH = CELL_MIN + 1;
const OVERSCAN = 6;
// A bounded scroll viewport so there is a known height to window against. The sticky header
// (position:sticky; top:0) sticks to the top of this scroll container.
const VIEWPORT_MAX = "min(70vh, 800px)";

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

// One data row: the sticky name rowheader + its day cells. `r` is the 0-based flat data-row
// index (drives stable cell ids + roving focus); `ariaRow` is the TRUE 1-based aria-rowindex
// (header = 1) so windowing never disturbs the announced row numbers. Used by both the
// grouped (un-windowed) and the windowed (ungrouped) render paths.
function DataRow({
  row,
  r,
  ariaRow,
  prefix,
  pos,
}: {
  row: WallRow;
  r: number;
  ariaRow: number;
  prefix: string;
  pos: GridPos;
}) {
  const nameCellId = cellId(prefix, r, 0);
  const nameActive = pos.row === r && pos.col === 0;
  return (
    <div role="row" aria-rowindex={ariaRow} style={{ display: "contents" }}>
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
}

// A full-width, aria-hidden grid item used to reserve the height of off-screen rows so the
// scroll height (and thus the scrollbar) matches the full list while those rows are unrendered.
function Spacer({ height }: { height: number }) {
  return <div aria-hidden style={{ gridColumn: "1 / -1", height }} />;
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

  // ─── Row windowing (Epic 21.3) ──────────────────────────────────────────────────────
  // SCOPING: windowing applies only to the UNGROUPED ("none") view — the company-wide,
  // 100+ employee case the AC targets. When a grouping is applied the views are segmented
  // (much smaller) and each group needs its own rowgroup + sticky group header, so we render
  // those WITHOUT windowing (exactly as before). This keeps rowgroup semantics correct.
  const windowed = data.options.groupBy === "none";

  // The bounded scroll viewport we window against (also the horizontal scroll container).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Throttle scroll bookkeeping to one update per animation frame.
  const onScroll = useCallback(() => {
    if (!windowed) return;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = scrollRef.current;
      if (el) setScrollTop(el.scrollTop);
    });
  }, [windowed]);

  // Measure the viewport height once mounted and on resize (so the window count is right).
  useLayoutEffect(() => {
    if (!windowed) return;
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [windowed]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // Compute the visible slice. Until the viewport is measured, fall back to a bounded slice
  // from the top so the FIRST paint is still windowed (initial render stays bounded).
  const measuredH = viewportH > 0 ? viewportH : 600;
  const { start, end } = useMemo(
    () => (windowed ? windowRange(scrollTop, measuredH, ROW_PITCH, rowCount, OVERSCAN) : { start: 0, end: rowCount }),
    [windowed, scrollTop, measuredH, rowCount],
  );

  // The ACTIVE row must always be in the rendered set so its aria-activedescendant id exists
  // even when it sits just outside the window (e.g. after Arrow nav). Widen the slice to
  // include pos.row; because the rows are contiguous this keeps a single top/bottom spacer.
  const vStart = windowed ? Math.min(start, pos.row) : start;
  const vEnd = windowed ? Math.max(end, pos.row + 1) : end;

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
      // Scrolling the active cell into view happens in an effect AFTER render, so a row that
      // was just outside the window (and is now included via vStart/vEnd) is in the DOM.
    },
    [pos, rowCount, colCount],
  );

  // After the active cell moves, scroll it into view. Runs post-render so the row exists in
  // the DOM even if nav crossed the window boundary; the scroll then updates the window.
  useEffect(() => {
    if (rowCount === 0) return;
    const el = gridRef.current?.querySelector<HTMLElement>(`#${CSS.escape(cellId(prefix, pos.row, pos.col))}`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pos, prefix, rowCount]);

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

  // Header row (aria-rowindex 1) — shared by both render paths.
  const header = (
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
  );

  // ── Body: windowed (ungrouped) vs grouped (rendered in full) ───────────────────────
  let body: React.ReactNode;
  if (windowed) {
    // One flat list (groupBy="none" → a single "Company" group). Only [vStart,vEnd) rows
    // are in the cell tree; the top/bottom spacers reserve the height of the unrendered
    // rows so the scrollbar matches the full list and the single CSS grid keeps the visible
    // rows column-aligned (spacers span the full width via gridColumn 1 / -1).
    const topRows = vStart;
    const bottomRows = rowCount - vEnd;
    body = (
      <div role="rowgroup" style={{ display: "contents" }}>
        {topRows > 0 && <Spacer height={topRows * ROW_PITCH} />}
        {flatRows.slice(vStart, vEnd).map((row, i) => {
          const r = vStart + i;
          return <DataRow key={row.employeeId} row={row} r={r} ariaRow={r + 2} prefix={prefix} pos={pos} />;
        })}
        {bottomRows > 0 && <Spacer height={bottomRows * ROW_PITCH} />}
      </div>
    );
  } else {
    // Grouped (6.2): each group is a rowgroup with a sticky group header; data rows keep a
    // continuous aria-rowindex across groups. Rendered in full (no windowing) — see SCOPING.
    let dataRowIdx = 0;
    body = data.groups.map((group) => (
      <div key={group.key} role="rowgroup" aria-label={group.label} style={{ display: "contents" }}>
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
        {group.rows.map((row) => {
          const r = dataRowIdx++;
          return (
            <DataRow key={`${group.key}-${row.employeeId}`} row={row} r={r} ariaRow={r + 2} prefix={prefix} pos={pos} />
          );
        })}
      </div>
    ));
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        overflowX: "auto",
        // Bounded vertical scroll viewport so windowing has a known height; the sticky day
        // header (position:sticky; top:0) sticks to the top of this container.
        overflowY: "auto",
        maxHeight: VIEWPORT_MAX,
        border: "1px solid var(--border)",
      }}
      data-testid="wall-chart"
    >
      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        aria-label={`Team calendar, ${data.monthLabel}`}
        // aria-rowcount is the FULL data-row count + the header, regardless of windowing.
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
        {header}
        {body}
      </div>
    </div>
  );
}
