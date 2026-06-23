import { describe, expect, it } from "vitest";
import { windowRange } from "@/core/wallchart";

// Epic 21.3 — pure fixed-height row-windowing math. rowH = 41 (CELL_MIN 40 + 1px border)
// mirrors the component; the viewport fits ~10 rows. overscan adds a margin each side.
const ROW_H = 41;
const VIEW = 410; // 10 rows tall
const OVER = 4;
const TOTAL = 200;

describe("windowRange", () => {
  it("at the top renders from row 0 with no negative start (overscan clamps)", () => {
    const { start, end } = windowRange(0, VIEW, ROW_H, TOTAL, OVER);
    expect(start).toBe(0); // floor(0/41) - 4 = -4 → clamped to 0
    // ceil(410/41)=10 visible + 2*4 overscan = 18
    expect(end).toBe(18);
  });

  it("in the middle returns a centred slice with overscan on both sides", () => {
    const scrollTop = 50 * ROW_H; // top of row 50 at the viewport top
    const { start, end } = windowRange(scrollTop, VIEW, ROW_H, TOTAL, OVER);
    expect(start).toBe(46); // 50 - 4 overscan
    expect(end).toBe(46 + 18); // start + 10 visible + 8 overscan
    expect(end).toBe(64);
  });

  it("at the bottom clamps end to total and never exceeds it", () => {
    const scrollTop = (TOTAL - 10) * ROW_H; // last full page
    const { start, end } = windowRange(scrollTop, VIEW, ROW_H, TOTAL, OVER);
    expect(end).toBe(TOTAL);
    expect(start).toBe(190 - OVER); // 186
    expect(end - start).toBeGreaterThan(0);
  });

  it("clamps start to total when scrolled past the end", () => {
    const { start, end } = windowRange(10_000 * ROW_H, VIEW, ROW_H, TOTAL, OVER);
    expect(start).toBeLessThanOrEqual(TOTAL);
    expect(end).toBe(TOTAL);
    expect(start).toBeLessThanOrEqual(end);
  });

  it("handles overscan = 0 (exact visible window)", () => {
    const { start, end } = windowRange(20 * ROW_H, VIEW, ROW_H, TOTAL, 0);
    expect(start).toBe(20);
    expect(end).toBe(30); // 10 visible rows, no margin
  });

  it("returns an empty range for an empty list", () => {
    expect(windowRange(0, VIEW, ROW_H, 0, OVER)).toEqual({ start: 0, end: 0 });
  });

  it("never windows past the end for a tiny list", () => {
    const { start, end } = windowRange(0, VIEW, ROW_H, 3, OVER);
    expect(start).toBe(0);
    expect(end).toBe(3); // fewer rows than the viewport can hold
  });

  it("guards against zero/negative row height or viewport", () => {
    expect(windowRange(100, VIEW, 0, TOTAL, OVER)).toEqual({ start: 0, end: 0 });
    expect(windowRange(100, 0, ROW_H, TOTAL, OVER)).toEqual({ start: 0, end: 0 });
  });

  it("treats a negative scrollTop as the top", () => {
    const { start } = windowRange(-200, VIEW, ROW_H, TOTAL, OVER);
    expect(start).toBe(0);
  });
});
