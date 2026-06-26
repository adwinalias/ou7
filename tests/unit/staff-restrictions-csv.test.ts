import { describe, expect, it } from "vitest";
import { buildStaffRestrictionsCsv } from "../../lib/restrictions";
import type { StaffRestrictionRow } from "../../lib/restrictions";

const row = (over: Partial<StaffRestrictionRow>): StaffRestrictionRow => ({
  id: "1",
  employeeAId: "a",
  employeeAName: "Alice Smith",
  employeeBId: "b",
  employeeBName: "Bob Jones",
  bidirectional: true,
  reason: null,
  ...over,
});

describe("buildStaffRestrictionsCsv", () => {
  it("emits header row", () => {
    const csv = buildStaffRestrictionsCsv([]);
    expect(csv).toBe("Person A,Person B,Both ways,Reason");
  });

  it("bidirectional=true → Yes", () => {
    const csv = buildStaffRestrictionsCsv([row({ bidirectional: true })]);
    expect(csv).toContain("Yes");
  });

  it("bidirectional=false → No", () => {
    const csv = buildStaffRestrictionsCsv([row({ bidirectional: false })]);
    expect(csv).toContain("No");
  });

  it("null reason emits empty field", () => {
    const csv = buildStaffRestrictionsCsv([row({ reason: null })]);
    // last field on the row should be empty
    const dataRow = csv.split("\r\n")[1];
    expect(dataRow?.endsWith(",")).toBe(true);
  });

  it("reason with a comma is quoted (csvField escaping)", () => {
    const csv = buildStaffRestrictionsCsv([row({ reason: "Same role, same shift" })]);
    expect(csv).toContain('"Same role, same shift"');
  });

  it("reason with a double-quote is escaped", () => {
    const csv = buildStaffRestrictionsCsv([row({ reason: 'Key "person"' })]);
    expect(csv).toContain('"Key ""person"""');
  });

  it("name with a comma is quoted", () => {
    const csv = buildStaffRestrictionsCsv([row({ employeeAName: "Smith, Alice" })]);
    expect(csv).toContain('"Smith, Alice"');
  });

  it("multiple rows separated by CRLF", () => {
    const csv = buildStaffRestrictionsCsv([
      row({ id: "1", reason: "cover" }),
      row({ id: "2", bidirectional: false, reason: null }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 data rows
    expect(lines[0]).toBe("Person A,Person B,Both ways,Reason");
  });
});
