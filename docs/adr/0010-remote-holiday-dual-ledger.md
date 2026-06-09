# ADR 0010 — Remote-only Holiday allowance (dual ledger)

**Status:** Accepted · **Date:** 2026-06-09 · **Deciders:** HR + build team

## Context

Remote staff get a second, separate allowance — the "Holiday" (office-closure) balance —
distinct from annual leave: HR-set per employee (default 5, editable to any number),
**non-carry** (lapses at year-end), and only for the Remote region.

## Decision

1. **A separate ledger, not a field on the annual period.** New `HolidayBalance`
   (`employeeId`, `year`, `days`, unique on `(employeeId, year)`). The annual allowance
   (`AllowancePeriod`) is untouched — the two balances are independent. `days` is an
   **HR-set input**; remaining is **engine-derived** via `core/allowance.holidayRemaining(days,
   taken)` (taken = 0 until consumption ships — see below).
2. **Remote-only.** `lib/holiday-balance` returns `null` for non-Remote employees and
   refuses writes for them; defaults to 5 for Remote when unset. HR-only writes, audited
   (`HOLIDAY_BALANCE_SET`).
3. **Non-carry by construction.** It's keyed per `year`; nothing carries it forward.
4. **Set/edit in the existing allowance admin** (`/admin/allowance`), shown for Remote
   employees alongside the annual balance.

## Consequences

- The Holiday balance is fully manageable by HR today; balances stay engine-derived.
- **Consumption is NOT built** (planned — see OVERNIGHT-NOTES.md). Until then, holiday
  remaining == set days.
- **Display in My Leave / Dashboard is deferred** because those pages live in unmerged PRs
  (#7/#8) — not on `main`; adding it here would be throwaway/conflicting. `getHolidayBalance`
  is ready for them to consume when they land (noted in OVERNIGHT-NOTES.md).

## Alternatives considered

- **Columns on `AllowancePeriod`** (e.g. `holidayDays`) — rejected: it's a genuinely separate
  bucket with its own rules; a separate table keeps the annual engine clean and makes the
  future consumption ledger natural.
