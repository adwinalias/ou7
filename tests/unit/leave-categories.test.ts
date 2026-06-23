import { describe, expect, it } from "vitest";
import { leaveCategory } from "../../core/leave-categories";

describe("leaveCategory", () => {
  it("maps SN → Sick (non-working)", () => {
    expect(leaveCategory("SN")).toBe("Sick (non-working)");
  });

  it("maps SW → Sick (WFH)", () => {
    expect(leaveCategory("SW")).toBe("Sick (WFH)");
  });

  it("maps H → National Holiday", () => {
    expect(leaveCategory("H")).toBe("National Holiday");
  });

  it.each(["V", "B", "M", "P", "W", "O"])("maps other code %s → Out", (code) => {
    expect(leaveCategory(code)).toBe("Out");
  });

  it("is case-insensitive and trims (no specific type leaks via casing)", () => {
    expect(leaveCategory("sn")).toBe("Sick (non-working)");
    expect(leaveCategory(" sw ")).toBe("Sick (WFH)");
    expect(leaveCategory("h")).toBe("National Holiday");
    expect(leaveCategory("v")).toBe("Out");
  });

  it("maps an unknown code to Out (fail-closed)", () => {
    expect(leaveCategory("ZZZ")).toBe("Out");
    expect(leaveCategory("")).toBe("Out");
  });
});
