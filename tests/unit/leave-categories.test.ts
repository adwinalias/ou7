import { describe, expect, it } from "vitest";
import { LEAVE_CATEGORIES, categoryColorVar, categoryShortCode, leaveCategory } from "../../core/leave-categories";

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

describe("categoryShortCode", () => {
  it("maps each category to a short cell label", () => {
    expect(categoryShortCode("Out")).toBe("OUT");
    expect(categoryShortCode("Sick (non-working)")).toBe("SCK");
    expect(categoryShortCode("Sick (WFH)")).toBe("WFH");
    expect(categoryShortCode("National Holiday")).toBe("HOL");
  });

  it("returns a distinct short code for every category (no collisions)", () => {
    const codes = LEAVE_CATEGORIES.map(categoryShortCode);
    expect(new Set(codes).size).toBe(LEAVE_CATEGORIES.length);
  });

  it("is short enough to fit a small cell (≤ 3 chars)", () => {
    for (const c of LEAVE_CATEGORIES) {
      expect(categoryShortCode(c).length).toBeLessThanOrEqual(3);
    }
  });

  it("never returns a specific personal leave-type code (no V/SN/SW/B/M/P/W/O/H identity)", () => {
    const realTypeCodes = ["V", "SN", "SW", "B", "M", "P", "W", "O", "H"];
    for (const c of LEAVE_CATEGORIES) {
      expect(realTypeCodes).not.toContain(categoryShortCode(c));
    }
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
