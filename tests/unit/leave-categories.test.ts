import { describe, expect, it } from "vitest";
import { LEAVE_CATEGORIES, categoryColorVar, leaveCategory } from "../../core/leave-categories";

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

describe("LEAVE_CATEGORIES", () => {
  it("has exactly the four categories in display order", () => {
    expect(LEAVE_CATEGORIES).toEqual([
      "Out",
      "Sick (non-working)",
      "Sick (WFH)",
      "National Holiday",
    ]);
  });
});

describe("categoryColorVar", () => {
  it("maps each category to its CSS variable (not a hex)", () => {
    expect(categoryColorVar("Out")).toBe("var(--lt-vacation)");
    expect(categoryColorVar("Sick (non-working)")).toBe("var(--lt-sick-not)");
    expect(categoryColorVar("Sick (WFH)")).toBe("var(--lt-sick-working)");
    expect(categoryColorVar("National Holiday")).toBe("var(--lt-national-holiday)");
  });

  it("returns a var() token for every category (never a raw hex)", () => {
    for (const c of LEAVE_CATEGORIES) {
      expect(categoryColorVar(c)).toMatch(/^var\(--lt-[a-z-]+\)$/);
    }
  });
});
