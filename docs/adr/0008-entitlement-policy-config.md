# ADR 0008 — Entitlement / carry-over policy as configurable data

**Status:** Accepted · **Date:** 2026-06-09 · **Deciders:** Build team

## Context

The per-region/role entitlement-day table and per-market carry-over caps are **HR inputs we
don't have** (PRD §14). The allowance engine needs an annual-days number to compute a
joiner's opening (pro-rata). We must not hard-code or invent these numbers, but we still need
a place for them to live so HR can enter them later and the engine can read them.

## Decision

1. **`EntitlementPolicy` model: one row per `region × role`** → `annualDays`,
   `carryOverCapDays` (nullable = none), `carryOverExpiry` (`MM-DD`, nullable). It is
   **editable data**, managed in `/admin/config`, **shipped empty** (no migration seed, no
   defaults). The unique key is `(regionId, role)`.

2. **The engine reads these numbers; it never owns them.** `core/allowance.proRataOpening`
   (already tested) takes `annualDays` as input. Employee provisioning (Epic 9.1) will read
   `getEntitlementPolicy(region, role)` and feed `annualDays` + joining date to the engine.
   **If no policy is configured for that region/role, 9.1 stops and flags it** rather than
   inventing a number — see the 9.1 story.

3. **Carry-over fields mirror the per-region fields already on `Region`.** The policy is the
   more specific (role-aware) source; carry-over application stays in `core/allowance.
   applyCarryOver`. (Reconciling Region.carryOver* vs policy.carryOver* is a future cleanup;
   for now policy is authoritative for entitlement, and year-roll carry-over is a later epic.)

4. **All config writes are audited** (`POLICY_CREATE/UPDATE/DELETE`, `LEAVE_TYPE_*`,
   `DEPARTMENT_CREATE`, `TAG_CREATE`).

## Scope deferred (recorded in OVERNIGHT-NOTES.md)

- **Branding + notification settings** — depend on PRD §14 inputs (brand assets, Teams/Azure)
  and Epic 11; not built.
- **Multi-level approval routing config** — that's Epic 5.5, explicitly out of this run.
  Single-approver assignment is handled with employee management (Epic 2.4 / 9.1).

## Consequences

- HR can stand up entitlement numbers without a deploy; the engine stays the single source of
  balance maths.
- Provisioning is intentionally blocked until a policy exists — a feature (no invented
  numbers), not a bug.

## Alternatives considered

- **Seed default entitlement numbers** — rejected: violates "don't invent numbers" (PRD §14).
- **Put entitlement on `Region` only (no role dimension)** — rejected: entitlement can differ
  by role; `region × role` is the stated requirement.
