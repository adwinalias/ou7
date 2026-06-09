# ADR 0011 — Leave cancellation rules & authorization (Epic 5.6)

**Status:** Accepted · **Date:** 2026-06-09 · **Deciders:** HR + build team

## Context

Staff need to cancel leave; HR needs an override. The rules were locked by HR and must be
enforced consistently and safely (it changes balances).

## Decision

1. **Pure rule in `core/cancellation.canCancel`** (role/ownership/status/Dubai dates):
   - Only `PENDING` or `APPROVED` may be cancelled.
   - Owner (non-HR) may self-cancel **only a PENDING** request, **strictly before** the start
     day (Dubai). On/after the start day, or any `APPROVED`, requires HR.
   - HR may cancel any cancellable request, before or after the start day.
   The day-before vs start-day boundary is unit-tested (`today >= start` → needs HR).

2. **Cancellation returns allowance automatically — never hand-written.** Cancelling sets
   `status → CANCELLED`; `core/allowance` counts only `APPROVED` days as taken, so a cancelled
   request's days drop out of the balance with no manual write.

3. **Authorize server-side; audit; transactional conditional update.** `lib/cancellation`:
   a non-owner non-HR caller gets **403**; rule denials (needs-HR / wrong status / on-after
   start) return a clear message. The write is `updateMany(where status ∈ {PENDING,APPROVED})`
   inside a transaction with a `LEAVE_CANCEL` audit event — so a concurrent decision can't be
   double-applied.

## Consequences

- One tested rule drives both the owner and HR paths.
- **UI scope this PR:** an HR Cancel action on the company pending queue (on `main`). The
  **owner self-cancel UI and an HR view of approved leave to cancel live in My Leave (PR #7,
  unmerged)** — `cancelLeaveRequest` is ready to wire there; deferred to avoid throwaway/
  conflicting edits (see OVERNIGHT-NOTES.md).

## Alternatives considered

- **Allow owner cancel up to/including the start day** — rejected; HR locked "strictly
  before the start day" for staff self-service.
- **Treat rule denials as 403** — used 403 only for the genuine "not your request" case;
  rule denials return a friendly message so the UI can explain (e.g. "contact HR").
