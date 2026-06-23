import { describe, expect, it } from "vitest";
import { nextCell, type GridPos } from "@/core/wallchart";

// Epic 20.1 — pure APG-grid navigation math. Coordinates are 0-based; col 0 is the
// rowheader name cell. A 5-row × 4-col grid (name + 3 day columns) is used throughout.
const ROWS = 5;
const COLS = 4;
const at = (row: number, col: number): GridPos => ({ row, col });

describe("nextCell", () => {
  it("moves within a row with arrows and clamps at horizontal edges", () => {
    expect(nextCell(at(2, 1), "ArrowRight", ROWS, COLS)).toEqual(at(2, 2));
    expect(nextCell(at(2, 1), "ArrowLeft", ROWS, COLS)).toEqual(at(2, 0));
    // clamp left at the name column
    expect(nextCell(at(2, 0), "ArrowLeft", ROWS, COLS)).toEqual(at(2, 0));
    // clamp right at the last day column
    expect(nextCell(at(2, COLS - 1), "ArrowRight", ROWS, COLS)).toEqual(at(2, COLS - 1));
  });

  it("moves across rows with up/down and clamps at vertical edges", () => {
    expect(nextCell(at(2, 1), "ArrowDown", ROWS, COLS)).toEqual(at(3, 1));
    expect(nextCell(at(2, 1), "ArrowUp", ROWS, COLS)).toEqual(at(1, 1));
    expect(nextCell(at(0, 1), "ArrowUp", ROWS, COLS)).toEqual(at(0, 1));
    expect(nextCell(at(ROWS - 1, 1), "ArrowDown", ROWS, COLS)).toEqual(at(ROWS - 1, 1));
  });

  it("Home/End jump to the start/end of the current row only", () => {
    expect(nextCell(at(3, 2), "Home", ROWS, COLS)).toEqual(at(3, 0));
    expect(nextCell(at(3, 1), "End", ROWS, COLS)).toEqual(at(3, COLS - 1));
  });

  it("Ctrl+Home/Ctrl+End jump to the grid corners", () => {
    expect(nextCell(at(3, 2), "CtrlHome", ROWS, COLS)).toEqual(at(0, 0));
    expect(nextCell(at(0, 0), "CtrlEnd", ROWS, COLS)).toEqual(at(ROWS - 1, COLS - 1));
  });

  it("normalises an out-of-bounds start and degenerate grids", () => {
    expect(nextCell(at(99, 99), "ArrowLeft", ROWS, COLS)).toEqual(at(ROWS - 1, COLS - 2));
    expect(nextCell(at(0, 0), "ArrowRight", 0, 0)).toEqual(at(0, 0));
  });
});
