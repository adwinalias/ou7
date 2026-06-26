import { describe, it, expect } from "vitest";
import { regionOnDate, type RegionAssignment } from "../../core/region";

describe("regionOnDate", () => {
  it("returns null for empty list", () => {
    expect(regionOnDate([], "2026-06-01")).toBeNull();
  });

  describe("single assignment", () => {
    const a: RegionAssignment[] = [{ regionId: "UAE", effectiveFromISO: "2026-01-01" }];

    it("date equals effectiveFrom → returns it", () => {
      expect(regionOnDate(a, "2026-01-01")).toBe("UAE");
    });

    it("date after effectiveFrom → returns it", () => {
      expect(regionOnDate(a, "2026-06-15")).toBe("UAE");
    });

    it("date before effectiveFrom → null", () => {
      expect(regionOnDate(a, "2025-12-31")).toBeNull();
    });
  });

  describe("two assignments (Beirut from joining, KSA from 2027-01-01)", () => {
    const two: RegionAssignment[] = [
      { regionId: "BEIRUT", effectiveFromISO: "2025-03-01" },
      { regionId: "KSA", effectiveFromISO: "2027-01-01" },
    ];

    it("date in 2026 → BEIRUT", () => {
      expect(regionOnDate(two, "2026-06-15")).toBe("BEIRUT");
    });

    it("2027-01-01 exactly → KSA (boundary inclusive)", () => {
      expect(regionOnDate(two, "2027-01-01")).toBe("KSA");
    });

    it("date in 2027 → KSA", () => {
      expect(regionOnDate(two, "2027-07-20")).toBe("KSA");
    });

    it("date before first assignment → null", () => {
      expect(regionOnDate(two, "2025-02-28")).toBeNull();
    });
  });

  describe("three+ assignments out of order in input", () => {
    // Deliberately pass in non-chronological order to verify correct sort/scan.
    const three: RegionAssignment[] = [
      { regionId: "KSA", effectiveFromISO: "2027-01-01" },
      { regionId: "REMOTE", effectiveFromISO: "2028-06-01" },
      { regionId: "BEIRUT", effectiveFromISO: "2025-03-01" },
    ];

    it("date in 2026 → BEIRUT", () => {
      expect(regionOnDate(three, "2026-05-01")).toBe("BEIRUT");
    });

    it("2027-01-01 → KSA", () => {
      expect(regionOnDate(three, "2027-01-01")).toBe("KSA");
    });

    it("2028-05-31 → KSA (just before REMOTE)", () => {
      expect(regionOnDate(three, "2028-05-31")).toBe("KSA");
    });

    it("2028-06-01 → REMOTE", () => {
      expect(regionOnDate(three, "2028-06-01")).toBe("REMOTE");
    });

    it("date in 2029 → REMOTE", () => {
      expect(regionOnDate(three, "2029-01-01")).toBe("REMOTE");
    });
  });

  describe("tie: same effectiveFromISO → last in input order wins", () => {
    const tie: RegionAssignment[] = [
      { regionId: "UAE", effectiveFromISO: "2026-01-01" },
      { regionId: "KSA", effectiveFromISO: "2026-01-01" },
    ];

    it("returns KSA (last entry)", () => {
      expect(regionOnDate(tie, "2026-01-01")).toBe("KSA");
    });
  });

  describe("input array not mutated", () => {
    it("preserves original order after call", () => {
      const arr: RegionAssignment[] = [
        { regionId: "KSA", effectiveFromISO: "2027-01-01" },
        { regionId: "BEIRUT", effectiveFromISO: "2025-03-01" },
      ];
      const copy = arr.map((x) => ({ ...x }));
      regionOnDate(arr, "2026-06-01");
      expect(arr).toEqual(copy);
    });
  });
});
