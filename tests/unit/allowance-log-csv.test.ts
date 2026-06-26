import { describe, expect, it } from "vitest";
import { buildAllowanceLogCsv, type AllowanceLogRow } from "../../lib/allowance-admin";

const row = (over: Partial<AllowanceLogRow> = {}): AllowanceLogRow => ({
  createdAtISO: "2026-03-15",
  year: 2026,
  kind: "ADJUSTMENT",
  bucket: "VACATION",
  delta: 5,
  reason: "Annual grant",
  actorName: "HR User",
  ...over,
});

describe("buildAllowanceLogCsv (Epic 31.3)", () => {
  it("emits header row", () => {
    const csv = buildAllowanceLogCsv([]);
    expect(csv).toBe("Date,Year,Kind,Bucket,Delta,Reason,By");
  });

  it("header + one data row", () => {
    const csv = buildAllowanceLogCsv([row()]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Date,Year,Kind,Bucket,Delta,Reason,By");
    expect(lines[1]).toBe("2026-03-15,2026,ADJUSTMENT,Vacation,5,Annual grant,HR User");
  });

  it("PUBLIC_HOLIDAY bucket renders as 'Public holiday'", () => {
    const csv = buildAllowanceLogCsv([row({ bucket: "PUBLIC_HOLIDAY", kind: "ADJUSTMENT" })]);
    expect(csv).toContain("Public holiday");
  });

  it("DEDUCTION kind is preserved as-is", () => {
    const csv = buildAllowanceLogCsv([row({ kind: "DEDUCTION", delta: -2 })]);
    expect(csv).toContain("DEDUCTION");
    expect(csv).toContain("-2");
  });

  it("reason with a comma is quoted (csvField escaping)", () => {
    const csv = buildAllowanceLogCsv([row({ reason: "Sick, extended" })]);
    expect(csv).toContain('"Sick, extended"');
  });

  it("reason with a double-quote is escaped", () => {
    const csv = buildAllowanceLogCsv([row({ reason: 'Year "end" bonus' })]);
    expect(csv).toContain('"Year ""end"" bonus"');
  });

  it("multiple rows separated by CRLF", () => {
    const csv = buildAllowanceLogCsv([
      row({ createdAtISO: "2026-03-15", year: 2026, delta: 5 }),
      row({ createdAtISO: "2025-12-01", year: 2025, delta: -2, kind: "DEDUCTION" }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it("actorName with a comma is quoted", () => {
    const csv = buildAllowanceLogCsv([row({ actorName: "Smith, Jane" })]);
    expect(csv).toContain('"Smith, Jane"');
  });
});
