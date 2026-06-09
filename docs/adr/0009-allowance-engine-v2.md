# ADR 0009 — Allowance engine v2: month-based pro-rata, Reset semantics, adjustments ledger

**Status:** Accepted · **Date:** 2026-06-09 · **Deciders:** HR + build team

## Context

The opening-grant rule was previously a placeholder (day-based). HR confirmed the real
pro-rata rule, and Epic 9.2 (allowance management) needed a storage/semantics decision for
manual adjustments, deductions and Reset/Add Balance — the most balance-sensitive write path.

## Decisions

1. **Pro-rata is month-based, rounded up.** `proRataOpening(annual, joiningISO, ys, ye)`:
   joined on/before the year start → **full annual, unrounded**; joined after the year → 0;
   otherwise `ceil(annual / 12 × months)` where `months = 12 − joiningMonthIndex` (the
   joining month counts as a full month, through December inclusive). Sanity with the seeded
   annuals, a March joiner (10 months): UAE 22→**19**, KSA 21→**18**, Beirut 15→**13**.
   Pure + exhaustively unit-tested. Same signature as before, so callers are unchanged.

2. **Adjustments/deductions are an audited LEDGER** (`AllowanceAdjustment`: employee, period,
   `kind` ADJUSTMENT|DEDUCTION, `delta`, `reason`, actor, createdAt). The
   `AllowancePeriod.adjustments`/`deductions` columns are a **derived projection** — the sum
   of the ledger — recomputed on every insert. The engine still reads those columns, so the
   balance read path (`getOpenPeriodBalance`/`computeRemaining`) is unchanged. **Only inputs
   are stored; the balance is always engine-derived.** Sign convention: ADJUSTMENT `delta` is
   signed (+grant / −clawback); DEDUCTION `delta` is a positive magnitude (subtracted by the
   engine). Every entry is audited (`ADJUSTMENT_ADD` / `DEDUCTION_ADD`).

3. **Concurrency: lock-then-recompute.** Both `addLedgerEntry` and `resetBalance` run in a
   transaction that does `SELECT … FOR UPDATE` on the period row *before* recomputing/writing
   the projection or opening. This serializes concurrent writers so two adjustments can't each
   recompute from a stale ledger and drop a delta (same pattern as approvals, ADR-0005).

4. **Reset = opening only.** Reset recomputes `opening` via `proRataOpening` and **leaves
   carry-over and adjustments untouched** — no clean-slate. "Add Balance" (no period yet)
   creates a period through the same engine path. Reset **stops and flags** if no entitlement
   policy is configured (no invented number). A before→after preview is shown before applying;
   the apply is audited (`ALLOWANCE_RESET` / `ALLOWANCE_ADD`).

5. **Negative Remaining is allowed, with a warning.** An adjustment may legitimately drive
   Remaining negative (clawback); we store it and surface a warning rather than blocking.
   New *requests* are still hard-blocked from over-booking by the engine, and approvals
   re-check (ADR-0005).

6. **HR-only, server-side.** All write paths require HR (`requireActor` + `isHR`, else 403).

## Consequences

- HR's "Reset" produces exactly the engine's number (same `proRataOpening` as provisioning).
- The ledger gives a full, auditable history; the projection keeps the read path fast.
- The rare "Add Balance with no existing period" path isn't fully race-proof (no row to lock
  when none exists) — acceptable for a manual HR action; a unique partial index on
  `(employeeId)` where `endDate IS NULL` could harden it later.

## Out of scope

The **Remote 5-day Holiday second ledger** — its joiner rule isn't finalised; not built. The
entitlement policy seed is editable config (ADR-0008), not hard-coded logic.
