# ADR 0005 — Approval: allowance debit, over-commit handling & concurrency

**Status:** Accepted · **Date:** 2026-06-08 · **Deciders:** Build team

## Context

Epic 5.4 (Approve / Decline) is the first action that consumes allowance. We had to
decide how approving "spends" days without violating the computed-balance guardrail
(CLAUDE.md / ADR 0003), what happens when a balance has been over-committed by the time an
approver acts, and how to keep two approvers (or two requests) from racing past the
over-booking check. The transition itself routes through the pure `core/approvals` state
machine; this ADR records the three surrounding decisions.

## Decision

1. **Approval debits allowance purely by the `PENDING → APPROVED` status flip.** No balance
   number is ever written. `core/allowance` derives Remaining/Available from the period's
   fields minus the days of *approved* requests; once a request is APPROVED its
   `allowanceDays` count as taken automatically. There is no `balance` column to update, so
   approval cannot drift from the engine. Declining writes only the status + reason.

2. **An over-committed balance blocks approval until HR adjusts it** — we do *not* allow
   first-come approval up to a reduced cap. At approval time `core/approvals.decideLeave`
   re-runs the over-booking check (`canBook(remainingExclR − otherPending, allowanceDays)`)
   against the *current* balance. If a later HR adjustment / carry-over change shrank the
   allowance below what was pending, the approval is refused with an explicit message naming
   HR as the resolver (`OVER_COMMIT_MESSAGE`). Rationale: silently approving "whoever clicks
   first" up to the reduced cap would arbitrarily decide which already-submitted request
   loses its days; an over-committed balance is a data problem HR must reconcile, not a race
   the approver should resolve by accident.

3. **Concurrency = period row lock + conditional "only while PENDING" update**, both inside
   one transaction (`lib/approvals.decideLeaveRequest`):
   - Lock the `AllowancePeriod` row (`SELECT … FOR UPDATE`) before reading the balance, so
     concurrent approvals against the **same** balance serialize — the second waits, then
     re-reads a balance that already reflects the first approval, so it can't also pass the
     over-booking check.
   - Write via `updateMany({ where: { id, status: "PENDING" }, … })`; if it affects 0 rows,
     another decision committed first, so we report "already decided" instead of
     double-applying. This guards the **same** request against a double-decide race.

## Consequences

- Balances stay trustworthy and explainable: the only way to spend allowance is to approve a
  request, and the spend equals that request's recorded days.
- Approval can fail late (over-commit) — surfaced clearly to the approver, with HR as the
  fix. Acceptable: it's rare and the alternative corrupts balances or arbitrarily drops days.
- One extra locked read per deducting approval; negligible at our scale and only on the
  approve path for allowance-deducting types.
- The lock is per allowance period, so it doesn't serialize unrelated employees' approvals.

## Alternatives considered

- **Store a running balance and decrement on approval** — rejected: reintroduces a
  hand-maintained number that can drift from the engine (violates ADR 0003).
- **First-come approval up to the reduced cap when over-committed** — rejected: non-
  deterministic which request loses days; an over-commit should be reconciled by HR.
- **Optimistic concurrency only (conditional update, no lock)** — rejected: it prevents
  double-deciding one request but lets two *different* requests both pass the over-booking
  check before either commits. The period lock closes that window.
- **Serializable isolation for the whole transaction** — heavier and pushes retry handling
  onto callers; a targeted row lock is sufficient and simpler.
