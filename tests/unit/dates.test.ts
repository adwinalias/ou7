import { describe, expect, it } from "vitest";
import { greetingForHour } from "../../core/dates";

describe("greetingForHour", () => {
  it("returns morning for 05:00–11:59", () => {
    expect(greetingForHour(5)).toBe("morning");
    expect(greetingForHour(8)).toBe("morning");
    expect(greetingForHour(11)).toBe("morning");
  });

  it("returns afternoon for 12:00–16:59", () => {
    expect(greetingForHour(12)).toBe("afternoon");
    expect(greetingForHour(16)).toBe("afternoon");
  });

  it("returns evening for 17:00–04:59", () => {
    expect(greetingForHour(17)).toBe("evening");
    expect(greetingForHour(23)).toBe("evening");
    expect(greetingForHour(0)).toBe("evening");
    expect(greetingForHour(4)).toBe("evening");
  });
});
