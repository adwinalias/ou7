# ADR 0013 — Multi-year balances, year rollover & typed adjustment ledger

**Status:** Accepted · **Date:** 2026-06-24 · **Deciders:** HR + build team (DC4 resolved 2026-06-23)

## Context

Epic 24 makes balances correct and legible **across calendar years** and gives HR a
controlled, audited way to adjust them. The v2 PRD flags this as the one change that brushes
the "no change to the allowance engine's logic" non-goal, so it requires an ADR first.

Today (`schema.prisma`, ADR-0009/0010):
- `AllowancePeriod` is **already year-scoped** — one row per employee per year with
  `startDate`/`endDate` (`endDate = null` ⇒ the current/open period), plus `opening`,
  `carryOver`, `adjustments`, `deductions`, and the `publicHolidays` / `sickTaken*` bucket
  projections. So multi-year *storage* mostly exists; what's missing is a defined **rollover**
  and **per-year visibility**.
- `AllowanceAdjustment` is the append-only manual-change ledger (`kind` = ADJUSTMENT |
  DEDUCTION, `delta`, `reason`, `actor`), but every entry feeds the single `adjustments`
  projection — it cannot say *which bucket* it credits (e.g. public-holiday vs vacation days).

## Decisions

1. **Year rollover (24.1) — derive, never mutate prior years.** Rolling `Y → Y+1` closes the
   current period (sets `endDate`) and opens a `Y+1` period whose `opening` comes from the
   **locked** entitlement-policy pro-rata (full annual for existing staff) and whose
   `carryOver = min(priorYearRemaining, carryOverCap)` per the locked per-market policy
   (cap 5, expiry 31 Mar). The prior-year period and its ledger are **immutable** after
   rollover — next year's figures are *derived* from them, not by editing them. The rollover
   computation is **pure and lives in `core/allowance`** and is exhaustively unit-tested; the
   existing `proRataOpening`/`applyCarryOver` rules are **unchanged** (reused, not rewritten).

2. **Typed adjustment ledger (24.3) — the only manual path, now bucket-aware.** Add an
   `AllowanceBucket` enum (`VACATION`, `PUBLIC_HOLIDAY`) and a `bucket` column on
   `AllowanceAdjustment`, **defaulting to `VACATION`** so the migration is backward-safe and
   every existing entry keeps its current meaning. Each new ledger entry must name the bucket
   it credits/debits. Manual balance changes remain **ledger-only** — there is still no direct
   edit of `opening`/`remaining`/`pending` anywhere — and every entry stays **audited and
   authz-checked** (HR only). Derived balances **recompute from the ledger**: `VACATION`-bucket
   deltas behave exactly as today (the `adjustments` projection feeding annual remaining);
   `PUBLIC_HOLIDAY`-bucket deltas credit the `publicHolidays` projection. The engine's
   pro-rata/carry-over/over-booking rules are **untouched**; this only adds bucket routing
   around them.

3. **Per-year visibility (24.2) — read-only, no schema change.** Admin allowance shows the
   **year**, the **previous year alongside the current** without re-selecting, and lets HR
   drill from a year's balance into that year's leave records. `getAllPeriodBalances` already
   returns every year's period; this is presentation only.

## Consequences

- **Migration:** one additive Prisma migration adds the `AllowanceBucket` enum + the
  `AllowanceAdjustment.bucket` column with `@default(VACATION)`. Additive + defaulted ⇒ safe on
  existing rows; CI applies it via `prisma migrate deploy`.
- **Engine guardrail honoured:** the locked pro-rata/carry-over/over-booking logic is reused
  unchanged; only bucket routing and a pure rollover function are added — both deterministic
  and unit-tested in `core/`. No AI at runtime.
- **History integrity:** prior-year periods/ledgers are never mutated, so audits and prior
  balances stay reproducible.
- **Out of scope here:** an automated scheduled rollover job (rollover is an explicit,
  audited HR action / function); cross-region transfer of carry-over.

## Alternatives considered

- *Mutating one running period across years* — rejected: loses prior-year history and breaks
  reproducibility/audit.
- *A separate balance table per bucket* — rejected as heavier than needed; the period already
  carries bucket projections, so a bucket-tagged ledger entry is the smaller change.
- *Free-text adjustment "category"* — rejected: a typed enum is validated, audited, and lets
  the engine route deterministically.
