// Wall-chart grid construction. Pure, deterministic, exhaustively tested. No I/O.
// Turns an employee's leave segments + their region calendar into one cell per day of a
// month. The UI just renders these cells. Privacy is upstream: segments never carry notes.
import { eachDate, toISO } from "../dates";
import { isWorkingDay } from "../calendar";
import type { DurationMode, HalfDayPeriod, ISODate, RegionCalendar } from "../types";

export interface WallSegment {
  startISO: ISODate;
  endISO: ISODate;
  status: "APPROVED" | "PENDING";
  code: string; // leave-type letter shown in the cell
  color: string; // leave-type hex (data-driven)
  mode: DurationMode;
  half: HalfDayPeriod | null;
}

// "off" = weekend/holiday (non-working) → faint hatch, never grey.
// "approved" = solid leave-type fill. "pending" = grey + coloured left bar.
// "none" = working day, no leave.
export type CellKind = "off" | "approved" | "pending" | "none";

export interface WallCell {
  iso: ISODate;
  day: number;
  kind: CellKind;
  today: boolean;
  code?: string;
  color?: string;
  half?: HalfDayPeriod;
}

export interface MonthDay {
  iso: ISODate;
  day: number;
  weekday: number; // 0=Sun … 6=Sat
  working: boolean;
}

/** Number of days in a 1-based month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The ISO dates of a 1-based month, in order. */
export function monthDays(year: number, month: number): ISODate[] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
  return [...eachDate(first, last)].map(toISO);
}

/** Header metadata for each day of the month (weekday + working/non-working). */
export function monthHeader(year: number, month: number, cal: RegionCalendar): MonthDay[] {
  return monthDays(year, month).map((iso) => {
    const d = new Date(`${iso}T00:00:00.000Z`);
    return { iso, day: d.getUTCDate(), weekday: d.getUTCDay(), working: isWorkingDay(d, cal) };
  });
}

function covers(seg: WallSegment, iso: ISODate): boolean {
  return seg.startISO <= iso && iso <= seg.endISO; // ISO strings sort chronologically
}

/**
 * One cell per day for an employee. Non-working days render as "off" regardless of any
 * span (leave never counts weekends/holidays). On a working day the covering segment, if
 * any, sets approved/pending; an approved segment wins over a pending one on the same day.
 * A HALF segment marks AM/PM on its single day.
 */
export function buildRow(
  days: ISODate[],
  segments: WallSegment[],
  cal: RegionCalendar,
  todayISO?: ISODate,
): WallCell[] {
  return days.map((iso) => {
    const d = new Date(`${iso}T00:00:00.000Z`);
    const base: WallCell = { iso, day: d.getUTCDate(), kind: "none", today: iso === todayISO };

    if (!isWorkingDay(d, cal)) return { ...base, kind: "off" };

    const covering = segments.filter((s) => covers(s, iso));
    if (covering.length === 0) return base;

    // Approved takes precedence over pending when both somehow cover the day.
    const seg = covering.find((s) => s.status === "APPROVED") ?? covering[0]!;
    return {
      ...base,
      kind: seg.status === "APPROVED" ? "approved" : "pending",
      code: seg.code,
      color: seg.color,
      half: seg.mode === "HALF" && seg.half ? seg.half : undefined,
    };
  });
}

/** The value a cell contributes to a CSV export (Epic 6.4): code (with ½ for half days),
 *  "—" for non-working, "" for an available working day. */
export function cellCsv(cell: WallCell): string {
  if (cell.kind === "off") return "—";
  if (cell.kind === "none") return "";
  return `${cell.half ? "½" : ""}${cell.code ?? ""}`;
}

// ─── Grouping & sorting (Epic 6.2) — pure ────────────────────────────────────────
export type GroupBy = "none" | "department" | "region" | "tag";
export type SortBy = "name" | "department";

export interface GroupableRow {
  name: string;
  departmentName: string | null;
  regionName: string;
  tags: string[];
}

export interface RowGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

const NO_DEPT = "No department";
const UNTAGGED = "Untagged";

/** Stable sort by employee name, or by department (then name). Does not mutate input. */
export function sortRows<T extends GroupableRow>(rows: T[], by: SortBy): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return [...rows].sort((a, b) => {
    if (by === "department") {
      const d = (a.departmentName ?? NO_DEPT).localeCompare(b.departmentName ?? NO_DEPT);
      if (d !== 0) return d;
    }
    return byName(a, b);
  });
}

/**
 * Group rows by company (none → one group), department, region, or tag. A row with
 * several tags appears under each; a row with none falls under "Untagged". Groups are
 * label-sorted; row order within a group is preserved (sort first if you want it ordered).
 */
export function groupRows<T extends GroupableRow>(rows: T[], by: GroupBy): RowGroup<T>[] {
  if (by === "none") return rows.length ? [{ key: "all", label: "Company", rows }] : [];

  const map = new Map<string, T[]>();
  const add = (label: string, row: T) => (map.get(label) ?? map.set(label, []).get(label)!).push(row);

  for (const row of rows) {
    if (by === "department") add(row.departmentName ?? NO_DEPT, row);
    else if (by === "region") add(row.regionName, row);
    else if (row.tags.length === 0) add(UNTAGGED, row);
    else for (const tag of row.tags) add(tag, row);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, groupRows]) => ({ key: label, label, rows: groupRows }));
}

/**
 * Choose a readable letter colour for a solid leave-type block: ink on light hues,
 * paper on dark hues (relative luminance, sRGB). Returns a semantic token name so the
 * component never hard-codes a colour. Data-driven by the leave-type hex.
 */
export function letterColorToken(hex: string): "ink" | "paper" {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return "paper";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Threshold tuned so dark brand hues (blue, violet, deep green, brown…) take paper and
  // only the light leave hues (paternity, OOO, amber) take ink — per DESIGN-SYSTEM §2,
  // and AA-correct (ink is the higher-contrast choice on those lighter blocks).
  return luminance > 0.22 ? "ink" : "paper";
}

// --- Wall-chart keyboard navigation (Epic 20.1, WAI-ARIA APG Grid pattern) -------------
// Pure grid-coordinate math: where does the active cell move for a given key? Coordinates
// are 0-based here (row 0 = first data row, col 0 = the rowheader name cell). The component
// maps these onto stable ids and 1-based aria-row/colindex. Edges clamp (no wrap). Kept in
// core/ so it is deterministic and unit-tested without rendering.
export interface GridPos {
  row: number;
  col: number;
}

export type GridNavKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End"
  | "CtrlHome"
  | "CtrlEnd";

/**
 * Next active cell for an APG grid keydown. `rows`/`cols` are the counts of *data* rows and
 * columns (cols includes the name rowheader at index 0). All moves clamp at the edges.
 * Home/End go to the start/end of the current row; CtrlHome/CtrlEnd to the grid corners.
 * Returns the (possibly unchanged) position; never out of bounds.
 */
export function nextCell(active: GridPos, key: GridNavKey, rows: number, cols: number): GridPos {
  if (rows <= 0 || cols <= 0) return active;
  const maxR = rows - 1;
  const maxC = cols - 1;
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(v, hi));
  const r = clamp(active.row, maxR);
  const c = clamp(active.col, maxC);
  switch (key) {
    case "ArrowLeft":
      return { row: r, col: clamp(c - 1, maxC) };
    case "ArrowRight":
      return { row: r, col: clamp(c + 1, maxC) };
    case "ArrowUp":
      return { row: clamp(r - 1, maxR), col: c };
    case "ArrowDown":
      return { row: clamp(r + 1, maxR), col: c };
    case "Home":
      return { row: r, col: 0 };
    case "End":
      return { row: r, col: maxC };
    case "CtrlHome":
      return { row: 0, col: 0 };
    case "CtrlEnd":
      return { row: maxR, col: maxC };
    default:
      return { row: r, col: c };
  }
}
