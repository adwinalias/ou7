import { describe, expect, it } from "vitest";
import { csvField, toCsv } from "../../core/csv";
import { cellCsv } from "../../core/wallchart";
import type { WallCell } from "../../core/wallchart";

describe("csvField", () => {
  it("leaves plain values unquoted", () => {
    expect(csvField("Vacation")).toBe("Vacation");
    expect(csvField("")).toBe("");
  });

  it("quotes and escapes commas, quotes and newlines", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and fields with commas", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });

  it("escapes per field", () => {
    expect(toCsv([["Doe, John", "x"]])).toBe('"Doe, John",x');
  });
});

describe("cellCsv", () => {
  const cell = (over: Partial<WallCell>): WallCell => ({ iso: "2026-06-15", day: 15, kind: "none", today: false, ...over });

  it("maps cell kinds to export values", () => {
    expect(cellCsv(cell({ kind: "none" }))).toBe("");
    expect(cellCsv(cell({ kind: "off" }))).toBe("—");
    expect(cellCsv(cell({ kind: "approved", code: "V" }))).toBe("V");
    expect(cellCsv(cell({ kind: "pending", code: "V" }))).toBe("V");
    expect(cellCsv(cell({ kind: "approved", code: "V", half: "AM" }))).toBe("½V");
  });
});
