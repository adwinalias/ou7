import { describe, expect, it } from "vitest";
import { parseEmployeeImport } from "../../core/employee-import";

const regions = ["UAE", "KSA"];

describe("parseEmployeeImport", () => {
  it("parses valid rows and lowercases emails", () => {
    const res = parseEmployeeImport("A.B@interestingtimes.me,Aya,Brahim,UAE,2026-02-01", regions);
    expect(res.errors).toEqual([]);
    expect(res.valid).toEqual([{ line: 1, email: "a.b@interestingtimes.me", firstName: "Aya", lastName: "Brahim", regionName: "UAE", joiningISO: "2026-02-01" }]);
  });

  it("skips a header row and blank lines", () => {
    const res = parseEmployeeImport("email,firstName,lastName,region,joiningDate\n\nx@y.co,X,Y,KSA,2026-01-01\n", regions);
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0]!.line).toBe(3);
  });

  it("reports per-line errors (bad email, unknown region, bad date, short row)", () => {
    const res = parseEmployeeImport(
      ["bad-email,A,B,UAE,2026-01-01", "x@y.co,A,B,Mars,2026-01-01", "x2@y.co,A,B,UAE,01-01-2026", "tooFew,cols"].join("\n"),
      regions,
    );
    expect(res.valid).toHaveLength(0);
    expect(res.errors.map((e) => e.line)).toEqual([1, 2, 3, 4]);
    expect(res.errors[0]!.message).toContain("invalid email");
    expect(res.errors[1]!.message).toContain("unknown region");
    expect(res.errors[2]!.message).toContain("YYYY-MM-DD");
  });

  it("flags duplicate emails within the file", () => {
    const res = parseEmployeeImport(["dup@y.co,A,B,UAE,2026-01-01", "dup@y.co,C,D,KSA,2026-01-02"].join("\n"), regions);
    expect(res.valid).toHaveLength(1);
    expect(res.errors[0]!.message).toContain("duplicate email");
  });
});
