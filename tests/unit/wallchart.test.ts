import { describe, expect, it } from "vitest";
import { buildRow, daysInMonth, letterColorToken, monthDays, monthHeader, type WallSegment } from "../../core/wallchart";
import type { ISODate, RegionCalendar } from "../../core/types";

// UAE-style calendar: weekend = Sat(6)/Sun(0). One holiday to prove holidays read as "off".
const cal: RegionCalendar = { weekendDays: [6, 0], holidays: new Set<ISODate>(["2026-06-16"]) };

function seg(over: Partial<WallSegment> & Pick<WallSegment, "startISO" | "endISO">): WallSegment {
  return { status: "APPROVED", code: "V", color: "#2F6FEB", mode: "MULTI", half: null, ...over };
}

const cellFor = (cells: ReturnType<typeof buildRow>, iso: string) => cells.find((c) => c.iso === iso)!;

describe("daysInMonth / monthDays", () => {
  it("counts month lengths incl. leap February", () => {
    expect(daysInMonth(2026, 6)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("lists every day in order", () => {
    const days = monthDays(2026, 6);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-06-01");
    expect(days[29]).toBe("2026-06-30");
  });
});

describe("monthHeader", () => {
  it("marks weekends and holidays as non-working", () => {
    const header = monthHeader(2026, 6, cal);
    const day = (iso: string) => header.find((h) => h.iso === iso)!;
    expect(day("2026-06-13").working).toBe(false); // Sat
    expect(day("2026-06-14").working).toBe(false); // Sun
    expect(day("2026-06-15").working).toBe(true); // Mon
    expect(day("2026-06-16").working).toBe(false); // holiday
  });
});

describe("buildRow", () => {
  const days = monthDays(2026, 6);

  it("renders weekends and holidays as off, empty working days as none", () => {
    const cells = buildRow(days, [], cal);
    expect(cellFor(cells, "2026-06-13").kind).toBe("off"); // Sat
    expect(cellFor(cells, "2026-06-16").kind).toBe("off"); // holiday
    expect(cellFor(cells, "2026-06-15").kind).toBe("none"); // working, no leave
  });

  it("renders an approved single day as a solid block with code/colour", () => {
    const cells = buildRow(days, [seg({ startISO: "2026-06-15", endISO: "2026-06-15", mode: "DAY" })], cal);
    const c = cellFor(cells, "2026-06-15");
    expect(c.kind).toBe("approved");
    expect(c.code).toBe("V");
    expect(c.color).toBe("#2F6FEB");
    expect(c.half).toBeUndefined();
  });

  it("renders pending as pending", () => {
    const cells = buildRow(days, [seg({ startISO: "2026-06-15", endISO: "2026-06-15", mode: "DAY", status: "PENDING" })], cal);
    expect(cellFor(cells, "2026-06-15").kind).toBe("pending");
  });

  it("marks AM/PM for a half day", () => {
    const cells = buildRow(days, [seg({ startISO: "2026-06-17", endISO: "2026-06-17", mode: "HALF", half: "PM" })], cal);
    const c = cellFor(cells, "2026-06-17");
    expect(c.kind).toBe("approved");
    expect(c.half).toBe("PM");
  });

  it("spans a multi-day range but keeps weekends inside it as off", () => {
    const cells = buildRow(days, [seg({ startISO: "2026-06-12", endISO: "2026-06-17" })], cal);
    expect(cellFor(cells, "2026-06-12").kind).toBe("approved"); // Fri
    expect(cellFor(cells, "2026-06-13").kind).toBe("off"); // Sat inside span
    expect(cellFor(cells, "2026-06-14").kind).toBe("off"); // Sun inside span
    expect(cellFor(cells, "2026-06-15").kind).toBe("approved"); // Mon
    expect(cellFor(cells, "2026-06-16").kind).toBe("off"); // holiday inside span
    expect(cellFor(cells, "2026-06-17").kind).toBe("approved"); // Wed
  });

  it("prefers approved over pending on the same day", () => {
    const cells = buildRow(
      days,
      [
        seg({ startISO: "2026-06-15", endISO: "2026-06-15", mode: "DAY", status: "PENDING", code: "P" }),
        seg({ startISO: "2026-06-15", endISO: "2026-06-15", mode: "DAY", status: "APPROVED", code: "V" }),
      ],
      cal,
    );
    const c = cellFor(cells, "2026-06-15");
    expect(c.kind).toBe("approved");
    expect(c.code).toBe("V");
  });

  it("flags today", () => {
    const cells = buildRow(days, [], cal, "2026-06-15");
    expect(cellFor(cells, "2026-06-15").today).toBe(true);
    expect(cellFor(cells, "2026-06-16").today).toBe(false);
  });
});

describe("letterColorToken", () => {
  it("picks paper on dark hues, ink on light hues", () => {
    expect(letterColorToken("#2F6FEB")).toBe("paper"); // vacation blue (dark)
    expect(letterColorToken("#14633F")).toBe("paper"); // deep green
    expect(letterColorToken("#79C36A")).toBe("ink"); // paternity light green
    expect(letterColorToken("#B58900")).toBe("ink"); // ochre
  });

  it("defaults to paper for malformed input", () => {
    expect(letterColorToken("nope")).toBe("paper");
  });
});
