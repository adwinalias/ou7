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

// Story 26.3 — per-type cancellation window
describe("canCancel — cancellationWindowDays (Story 26.3)", () => {
  // start = 2026-06-10 (Wednesday) throughout this suite

  describe("N = 0 (default) — ADR-0011 behaviour preserved", () => {
    it("omitting cancellationWindowDays behaves as N=0 — day before start is allowed", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-09", startISO: "2026-06-10" });
      expect(d.allowed).toBe(true);
    });

    it("N=0 explicit — day before start is allowed", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-09", startISO: "2026-06-10", cancellationWindowDays: 0 });
      expect(d.allowed).toBe(true);
    });

    it("N=0 — today = start is blocked with existing message", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-10", startISO: "2026-06-10", cancellationWindowDays: 0 });
      expect(d.allowed).toBe(false);
      expect(d.reason).toBe("You can't cancel on or after the start day — contact HR.");
    });

    it("N=0 — today = start+1 is blocked", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-11", startISO: "2026-06-10", cancellationWindowDays: 0 });
      expect(d.allowed).toBe(false);
    });
  });

  describe("N = 2", () => {
    // cutoff = start - 2 = 2026-06-08 (Monday)
    it("today = start-3 (2026-06-07) is allowed", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-07", startISO: "2026-06-10", cancellationWindowDays: 2 });
      expect(d.allowed).toBe(true);
    });

    it("today = start-2 = cutoff (2026-06-08) is blocked", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-08", startISO: "2026-06-10", cancellationWindowDays: 2 });
      expect(d.allowed).toBe(false);
      expect(d.reason).toBe("You must cancel at least 2 day(s) before the start — contact HR.");
    });

    it("today = start-1 (2026-06-09) is blocked", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-09", startISO: "2026-06-10", cancellationWindowDays: 2 });
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/2 day\(s\)/);
    });

    it("today = start (2026-06-10) is blocked", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-10", startISO: "2026-06-10", cancellationWindowDays: 2 });
      expect(d.allowed).toBe(false);
    });
  });

  describe("N = 5", () => {
    // start = 2026-06-10, cutoff = 2026-06-05
    it("today = start-6 (2026-06-04) is allowed", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-04", startISO: "2026-06-10", cancellationWindowDays: 5 });
      expect(d.allowed).toBe(true);
    });

    it("today = start-5 = cutoff (2026-06-05) is blocked", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-05", startISO: "2026-06-10", cancellationWindowDays: 5 });
      expect(d.allowed).toBe(false);
      expect(d.reason).toBe("You must cancel at least 5 day(s) before the start — contact HR.");
    });

    it("today = start-4 (2026-06-06) is blocked", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-06", startISO: "2026-06-10", cancellationWindowDays: 5 });
      expect(d.allowed).toBe(false);
    });

    it("today = start (2026-06-10) is blocked", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-10", startISO: "2026-06-10", cancellationWindowDays: 5 });
      expect(d.allowed).toBe(false);
    });

    it("today = start+3 (2026-06-13) is blocked", () => {
      const d = canCancel({ ...base, todayISO: "2026-06-13", startISO: "2026-06-10", cancellationWindowDays: 5 });
      expect(d.allowed).toBe(false);
    });
  });

  describe("calendar-day / weekend-holiday independence", () => {
    // start = 2026-06-13 (Saturday), N=2 → cutoff = 2026-06-11 (Thursday)
    it("cutoff is calendar days regardless of weekends — start on Saturday, cutoff on Thursday", () => {
      // today = 2026-06-10 (Wed) < cutoff 2026-06-11 → allowed
      expect(canCancel({ ...base, todayISO: "2026-06-10", startISO: "2026-06-13", cancellationWindowDays: 2 }).allowed).toBe(true);
      // today = 2026-06-11 (Thu) = cutoff → blocked
      const blocked = canCancel({ ...base, todayISO: "2026-06-11", startISO: "2026-06-13", cancellationWindowDays: 2 });
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toMatch(/2 day\(s\)/);
    });

    // start = 2026-06-07 (Sunday), N=3 → cutoff = 2026-06-04 (Thursday)
    it("start on Sunday — cutoff still pure calendar, no weekend skip", () => {
      expect(canCancel({ ...base, todayISO: "2026-06-03", startISO: "2026-06-07", cancellationWindowDays: 3 }).allowed).toBe(true);
      expect(canCancel({ ...base, todayISO: "2026-06-04", startISO: "2026-06-07", cancellationWindowDays: 3 }).allowed).toBe(false);
    });
  });

  describe("guardrails unchanged by window", () => {
    it("HR override: allowed regardless of large window", () => {
      // today = start (no early cancellation possible for owner) but HR bypasses
      const d = canCancel({ ...base, isOwner: false, isHR: true, todayISO: "2026-06-10", startISO: "2026-06-10", cancellationWindowDays: 30 });
      expect(d.allowed).toBe(true);
    });

    it("non-owner blocked regardless of window", () => {
      const d = canCancel({ ...base, isOwner: false, isHR: false, todayISO: "2026-06-01", startISO: "2026-06-10", cancellationWindowDays: 0 });
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/own leave/i);
    });

    it("APPROVED request blocked for owner regardless of window", () => {
      const d = canCancel({ ...base, status: "APPROVED", todayISO: "2026-06-01", startISO: "2026-06-10", cancellationWindowDays: 0 });
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/HR/i);
    });

    it("window does not unlock APPROVED for owner even when today is far before start", () => {
      const d = canCancel({ ...base, status: "APPROVED", todayISO: "2026-01-01", startISO: "2026-06-10", cancellationWindowDays: 2 });
      expect(d.allowed).toBe(false);
    });
  });
});
