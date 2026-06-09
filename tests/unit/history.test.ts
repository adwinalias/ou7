import { describe, expect, it } from "vitest";
import { durationLabel, sumColumns } from "../../core/history";

describe("durationLabel", () => {
  it("labels half and full single days", () => {
    expect(durationLabel("HALF", "2026-06-15", "2026-06-15")).toBe("½ day");
    expect(durationLabel("DAY", "2026-06-15", "2026-06-15")).toBe("1 day");
  });

  it("labels a multi-day inclusive span", () => {
    expect(durationLabel("MULTI", "2026-06-15", "2026-06-15")).toBe("1 day");
    expect(durationLabel("MULTI", "2026-06-15", "2026-06-19")).toBe("5 days");
    expect(durationLabel("MULTI", "2026-06-15", "2026-06-16")).toBe("2 days");
  });
});

describe("sumColumns", () => {
  it("totals the numeric columns", () => {
    expect(
      sumColumns([
        { freeDays: 2, workingDays: 5, allowanceDays: 5 },
        { freeDays: 0, workingDays: 0.5, allowanceDays: 0 },
      ]),
    ).toEqual({ freeDays: 2, workingDays: 5.5, allowanceDays: 5 });
  });

  it("returns zeros for an empty list and avoids float noise", () => {
    expect(sumColumns([])).toEqual({ freeDays: 0, workingDays: 0, allowanceDays: 0 });
    expect(sumColumns([{ freeDays: 0.1, workingDays: 0.2, allowanceDays: 0 }, { freeDays: 0.2, workingDays: 0.1, allowanceDays: 0 }])).toEqual({
      freeDays: 0.3,
      workingDays: 0.3,
      allowanceDays: 0,
    });
  });
});
