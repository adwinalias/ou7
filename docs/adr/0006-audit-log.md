# ADR 0006 — Audit log (immutable admin/approval record)

**Status:** Accepted · **Date:** 2026-06-09 · **Deciders:** Build team

## Context

Epic 16.1 requires an immutable record of admin and approval actions — who/what/when and
before→after — that HR can view, and that is "tamper-evident". It's built early because
every later write path (approvals, holidays, restricted days, HR console, employee changes)
must emit one.

## Decision

1. **One `AuditEvent` per write**, via a single `lib/audit.recordAudit(client, …)` helper
   capturing `actorId`, `action` (e.g. `LEAVE_APPROVE`, `EMPLOYEE_UPDATE`), `entity`,
   `entityId`, and JSON `before`/`after`. The helper takes a Prisma client so callers pass
   the **transaction** client — the audit row commits atomically with the change it records
   (an approval and its audit event either both land or neither do).

2. **Immutable by construction.** `lib/audit` exposes only create + read — there is no
   update or delete path for `AuditEvent` anywhere in the app. Events are append-only.

3. **HR-only viewer** at `/admin/audit` (`requireRole("HR")`), newest first, paginated,
   showing actor/action/entity and a compact before→after.

4. **Tamper-evidence, pragmatically.** Append-only + `actorId` + server timestamp is the
   baseline. We deliberately do **not** build a cryptographic hash-chain now (it adds write
   coupling and key management for little gain at our scale); the `before`/`after` snapshots
   already make unilateral edits detectable against the affected record. A hash-chain /
   periodic export to write-once storage can be layered on later without changing callers.

## Consequences

- Every mutating path gets one line (`await recordAudit(tx, …)`) and is covered by an
  integration test asserting the event exists with the right before/after.
- The audit table grows unbounded; retention/archival is an ops concern (Epic 16.6) and out
  of scope here.
- Because `recordAudit` runs inside the caller's transaction, a failed write leaves no
  orphan audit row.

## Alternatives considered

- **DB triggers** writing audit rows — rejected: hides the actor (no session at the DB
  layer) and splits logic out of the typed domain.
- **Hash-chained / signed events now** — deferred: real tamper-proofing is valuable but
  premature; the interface doesn't change when we add it.
- **Log to an external sink only** — rejected: HR needs an in-app, queryable view.
