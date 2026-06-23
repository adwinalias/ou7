import { describe, expect, it } from "vitest";
import { isSavedLayout, resolveLayout } from "../../lib/dashboard-layout";

const DEFAULT = ["allowance", "next7", "request"];
const REGISTERED = ["allowance", "next7", "request"];

describe("resolveLayout", () => {
  it("null saved → default order, nothing hidden (brand-new user)", () => {
    expect(resolveLayout(null, REGISTERED, DEFAULT)).toEqual({
      order: ["allowance", "next7", "request"],
      hidden: [],
    });
  });

  it("respects a saved (reordered) order", () => {
    const saved = { order: ["request", "allowance", "next7"], hidden: [] };
    expect(resolveLayout(saved, REGISTERED, DEFAULT)).toEqual({
      order: ["request", "allowance", "next7"],
      hidden: [],
    });
  });

  it("drops an unknown id present in the saved order", () => {
    const saved = { order: ["request", "ghost", "allowance", "next7"], hidden: [] };
    expect(resolveLayout(saved, REGISTERED, DEFAULT).order).toEqual([
      "request",
      "allowance",
      "next7",
    ]);
  });

  it("appends a registered id that is missing from the saved order (future widget)", () => {
    // saved order predates `request` being registered → it gets appended in default position.
    const saved = { order: ["next7", "allowance"], hidden: [] };
    expect(resolveLayout(saved, REGISTERED, DEFAULT)).toEqual({
      order: ["next7", "allowance", "request"],
      hidden: [],
    });
  });

  it("appends a brand-new registered id not named in defaultOrder", () => {
    const registered = [...REGISTERED, "whosoff"];
    const saved = { order: ["allowance", "next7", "request"], hidden: [] };
    expect(resolveLayout(saved, registered, DEFAULT).order).toEqual([
      "allowance",
      "next7",
      "request",
      "whosoff",
    ]);
  });

  it("respects the hidden set (registered ids only)", () => {
    const saved = { order: ["allowance", "next7", "request"], hidden: ["next7", "ghost"] };
    const out = resolveLayout(saved, REGISTERED, DEFAULT);
    expect(out.order).toEqual(["allowance", "next7", "request"]);
    expect(out.hidden).toEqual(["next7"]); // unknown "ghost" dropped
  });

  it("de-duplicates a repeated id in the saved order", () => {
    const saved = { order: ["allowance", "allowance", "next7", "request"], hidden: [] };
    expect(resolveLayout(saved, REGISTERED, DEFAULT).order).toEqual([
      "allowance",
      "next7",
      "request",
    ]);
  });

  it("is idempotent — re-resolving its own output is stable", () => {
    const saved = { order: ["request", "ghost", "next7"], hidden: ["next7"] };
    const once = resolveLayout(saved, REGISTERED, DEFAULT);
    const twice = resolveLayout(once, REGISTERED, DEFAULT);
    expect(twice).toEqual(once);
  });
});

describe("isSavedLayout", () => {
  it("accepts a well-formed layout", () => {
    expect(isSavedLayout({ order: ["a"], hidden: [] })).toBe(true);
    expect(isSavedLayout({ order: [], hidden: ["b"] })).toBe(true);
  });

  it("rejects malformed / non-object values", () => {
    expect(isSavedLayout(null)).toBe(false);
    expect(isSavedLayout("nope")).toBe(false);
    expect(isSavedLayout({ order: "x", hidden: [] })).toBe(false);
    expect(isSavedLayout({ order: [1, 2], hidden: [] })).toBe(false);
    expect(isSavedLayout({ order: [] })).toBe(false);
  });
});
