import { describe, expect, it } from "vitest";
import { canCancel, type CancelInput } from "../../core/cancellation";

const base: CancelInput = { status: "PENDING", isOwner: true, isHR: false, todayISO: "2026-06-01", startISO: "2026-06-10" };

describe("canCancel (Epic 5.6)", () => {
  it("rejects non-cancellable statuses", () => {
    for (const status of ["DECLINED", "CANCELLED"] as const) {
      expect(canCancel({ ...base, status, isHR: true }).allowed).toBe(false);
    }
  });

  it("lets an owner self-cancel a PENDING request the day before the start", () => {
    expect(canCancel({ ...base, todayISO: "2026-06-09", startISO: "2026-06-10" }).allowed).toBe(true);
  });

  it("blocks owner self-cancel ON the start day (boundary) — needs HR", () => {
    const d = canCancel({ ...base, todayISO: "2026-06-10", startISO: "2026-06-10" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/on or after the start day/i);
  });

  it("blocks owner self-cancel after the start day", () => {
    expect(canCancel({ ...base, todayISO: "2026-06-15", startISO: "2026-06-10" }).allowed).toBe(false);
  });

  it("blocks an owner cancelling their APPROVED request — needs HR", () => {
    const d = canCancel({ ...base, status: "APPROVED", todayISO: "2026-06-01", startISO: "2026-06-10" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/HR/i);
  });

  it("blocks a non-owner non-HR entirely", () => {
    expect(canCancel({ ...base, isOwner: false }).allowed).toBe(false);
  });

  it("lets HR cancel PENDING or APPROVED, before or after the start day", () => {
    expect(canCancel({ ...base, isOwner: false, isHR: true }).allowed).toBe(true);
    expect(canCancel({ ...base, status: "APPROVED", isOwner: false, isHR: true }).allowed).toBe(true);
    expect(canCancel({ ...base, status: "APPROVED", isOwner: false, isHR: true, todayISO: "2026-06-20" }).allowed).toBe(true);
  });
});
