# ADR 0007 — Restricted/blackout day enforcement & regional calendars

**Status:** Accepted · **Date:** 2026-06-09 · **Deciders:** Build team

## Context

Epic 10 makes each market's calendar correct: region weekends + public holidays (10.1),
restricted/blackout days (10.2), and clone-last-year (10.4). The PRD allows restricted days
to be "blocked or flagged"; we had to choose, and decide where enforcement lives so it
can't be bypassed.

## Decision

1. **Restricted days are a hard block at request time, in the pure core.** `core/leave.
   validateLeaveRequest` gains an optional `restricted: RestrictedRange[]`; any overlap with
   the requested range produces an error naming the reason. Because `submitLeave` re-runs
   the same validation, the block holds at both preview and submit — it can't be skipped by
   posting straight to submit. (Flag-only was rejected: a blackout that's merely advisory
   isn't a blackout; if HR wants soft guidance they can use a note.)

2. **Scope resolution is I/O, kept in `lib`.** `lib/calendars.getRestrictedRangesFor`
   gathers the ranges that apply to an employee — company-wide, their region, their
   department — and passes plain ranges to the pure validator. The core stays free of scope
   tables.

3. **Holidays feed the existing engine unchanged.** `core/calendar` already excludes
   `cal.holidays`; `lib/leave` and `lib/wallchart` already load region holidays. So 10.1 is
   just HR-managed data — adding a holiday immediately affects day-counting and the wall
   chart, no new consumption code. **Nothing is seeded; HR enters real dates.**

4. **Clone = copy same month/day to next year, skip existing.** Holidays drift
   (Islamic-calendar dates move), so clone is a *starting point* HR then edits, per the AC.

5. **Every calendar write is audited** (Epic 16.1): `HOLIDAY_CREATE/DELETE/CLONE`,
   `REGION_WEEKENDS_UPDATE`, `RESTRICTED_CREATE/DELETE`.

## Consequences

- Booking across a blackout fails with a clear, reasoned message at preview.
- Region weekends remain per-market (never hard-coded), satisfying the region-aware rule.
- 10.3 (minimum staffing) is **not** built here — it needs a per-department threshold and a
  presence calculation that's a larger, separable piece; noted for a later story.

## Alternatives considered

- **Enforce in `lib` only** — rejected: validation belongs in the tested pure core so every
  caller (preview, submit, future on-behalf) inherits it.
- **Flag (warn) instead of block** — rejected as the default; a restricted period is a hard
  rule. Could add an HR "advisory" variant later if a real need appears.
