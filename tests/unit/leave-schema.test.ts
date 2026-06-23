// Epic 22.5 — focused unit tests for the leave-request zod schema (`leaveInputSchema`), the
// validation contract shared by the client form and the server actions. Pure: imports only
// the exported schema (server-only is stubbed in the unit runner), no DB, deterministic.
import { describe, expect, it } from "vitest";
import { leaveInputSchema } from "@/lib/leave";

const base = { leaveTypeId: "lt-1", mode: "DAY" as const, startDate: "2026-08-18" };
const parse = (over: Record<string, unknown> = {}) => leaveInputSchema.safeParse({ ...base, ...over });
const messages = (r: ReturnType<typeof leaveInputSchema.safeParse>) =>
  r.success ? [] : r.error.issues.map((i) => i.message);

describe("leaveInputSchema (zod)", () => {
  it("accepts a minimal single-DAY request", () => {
    expect(parse().success).toBe(true);
  });

  it("requires a leave type", () => {
    expect(messages(parse({ leaveTypeId: "" }))).toContain("Choose a leave type.");
  });

  it("rejects an unknown mode", () => {
    expect(parse({ mode: "WEEK" }).success).toBe(false);
  });

  it("requires an ISO start date (YYYY-MM-DD)", () => {
    expect(messages(parse({ startDate: "18/08/2026" }))).toContain("Choose a start date.");
    expect(parse({ startDate: "2026-8-1" }).success).toBe(false);
  });

  describe("MULTI mode end-date refinement", () => {
    it("requires an end date on/after the start date", () => {
      expect(messages(parse({ mode: "MULTI", startDate: "2026-08-18", endDate: "2026-08-17" }))).toContain(
        "End date must be on or after the start date.",
      );
    });
    it("accepts an end date equal to or after the start date", () => {
      expect(parse({ mode: "MULTI", startDate: "2026-08-18", endDate: "2026-08-18" }).success).toBe(true);
      expect(parse({ mode: "MULTI", startDate: "2026-08-18", endDate: "2026-08-20" }).success).toBe(true);
    });
    it("fails MULTI without any end date", () => {
      expect(parse({ mode: "MULTI" }).success).toBe(false);
    });
  });

  describe("HALF mode period refinement", () => {
    it("requires AM/PM for a half day", () => {
      expect(messages(parse({ mode: "HALF" }))).toContain("Choose morning or afternoon.");
    });
    it("accepts a half day with a period", () => {
      expect(parse({ mode: "HALF", halfDayPeriod: "AM" }).success).toBe(true);
      expect(parse({ mode: "HALF", halfDayPeriod: "PM" }).success).toBe(true);
    });
    it("rejects an invalid half-day period", () => {
      expect(parse({ mode: "HALF", halfDayPeriod: "NOON" }).success).toBe(false);
    });
  });

  describe("notes + attachment fields", () => {
    it("caps notes at 2000 characters", () => {
      expect(parse({ notes: "a".repeat(2000) }).success).toBe(true);
      expect(parse({ notes: "a".repeat(2001) }).success).toBe(false);
    });
    it("accepts a valid attachment URL or an empty string, but rejects junk", () => {
      expect(parse({ attachmentUrl: "https://example.com/doc.pdf" }).success).toBe(true);
      expect(parse({ attachmentUrl: "" }).success).toBe(true); // explicit "no attachment"
      expect(messages(parse({ attachmentUrl: "not-a-url" }))).toContain("Enter a valid URL.");
    });
  });
});
