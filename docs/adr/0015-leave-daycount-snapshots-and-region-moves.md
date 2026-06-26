# ADR 0015 — Leave day-count snapshots & effective-dated region moves

**Status:** Accepted · **Date:** 2026-06-26 · **Deciders:** Eddy + build team · **Gates:** Epic 30 (`docs/V3-PRD.md`)

## Context

OU7 weekends and holidays are **region-driven** (ADR-0007; `Region.weekendDays` + `Holiday`), and Eddy confirmed we keep that model rather than WhosOff's per-user working schedule. The consequence Eddy raised: an employee can **move markets** — e.g. Beirut (weekend Sat/Sun) → KSA (weekend Fri/Sat) — so the *same* calendar dates count to a different number of working days. A move must **never silently recount already-booked leave** and corrupt balances or history.

What the codebase already does (verified):
- A request's day-counts are **computed once at creation** — `lib/leave.submitLeave` persists `LeaveRequest.workingDays`, `freeDays`, `allowanceDays` from `core/calendar.countDays(...)` against the employee's **then-current** region calendar.
- Balance math **reads the stored values** (`lib/allowance` sums `LeaveRequest.allowanceDays`); approval and cancellation **do not recompute** day-counts. So historical leave is already insulated from a later region change.
- **Gap:** `Employee.regionId` is a **single foreign key with no history** — there's no effective date for a move and no way to answer "which region (and weekend) applied on date D". A move just flips `regionId`.

## Decisions

1. **Day-count snapshots are the contract — formalize the existing behaviour as an invariant.** `LeaveRequest.{workingDays, freeDays, allowanceDays}` are computed once at creation and are **immutable** thereafter; **all** balance math reads the stored values; **nothing recomputes** a historical request against the current region. This is added to the guardrails and enforced by the `code-reviewer` (no path may recompute `allowanceDays` for an existing request). A small **backfill migration** sets any legacy/zero rows from their stored range as a safety net (the column has a default, so in practice ~none).

2. **Region assignment becomes effective-dated.** Add `EmployeeRegionAssignment { id, employeeId, regionId, effectiveFrom (date, Asia/Dubai), createdById, createdAt }`. `Employee.regionId` is **kept as a denormalised "current region" cache** for fast queries. On a move, HR sets an `effectiveFrom`; a new assignment row is written and `Employee.regionId` reflects the region once effective. **"Region on date D" = the latest assignment with `effectiveFrom ≤ D`.** New bookings count against the region effective on the booking's **start date**; existing bookings keep their snapshot. **Backfill:** one assignment row per employee with `effectiveFrom = joiningDate` and `regionId = current`.

3. **Audit + integrity.** A move records a `REGION_CHANGE` audit event (`recordAudit`, ADR-0006) with the `effectiveFrom`; the assignment history is immutable. An optional HR **integrity-check tool** (Epic 30.3) lists any request whose stored day-count differs from a fresh recompute against the region effective on its dates — read-only, never auto-mutates.

## Consequences

- Past leave and balances stay **stable and reproducible** across market moves; the wall chart and reports can render the correct weekend per date by consulting the effective region.
- **Most of Epic 30.1 is already satisfied** (snapshots exist); the real new work is **30.2** (effective-dated assignment + "region on date D" lookup) and the **30.3** integrity tool. Engine logic and `core/calendar` are unchanged.
- One additive migration (new table + backfill); `Employee.regionId` stays for fast current-state queries.
- **Out of scope:** prorating *entitlement/allowance* on a mid-year transfer (annual opening still follows the locked per-market policy; transfer-proration is a separate decision if ever needed) and any change to how weekends are defined (still `Region.weekendDays`).

## Alternatives considered

- **Recompute day-counts on read using the current region** — rejected: corrupts history the moment anyone moves, hurts performance, and defeats the entire purpose of this ADR.
- **Store the region directly on each `LeaveRequest`** instead of an assignment history — workable for protecting a single request, but loses the general "which region applied on any date" capability that reporting and the wall chart need, and duplicates data; the assignment history is the smaller, more general change.
- **No effective-dating, just flip `regionId`** — rejected: can't answer historical region, and a future-dated move (announced in advance) can't be scheduled.
