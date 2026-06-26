# ADR 0014 — Coverage controls & staff-vs-staff clash enforcement

**Status:** Accepted · **Date:** 2026-06-26 · **Deciders:** Eddy + build team · **Gates:** Epic 28, Epic 29 (`docs/V3-PRD.md`)

## Context

WhosOff lets an admin protect coverage three ways (see `docs/WHOSOFF-V3-FEATURE-MAP.md` §3/§5): a department **minimum staff level**, a department **maximum leave requests per day**, and **staff-vs-staff restrictions** ("these two can't be off together"). When a level is hit, WhosOff **refuses** the booking.

OU7 today (verified in the codebase):
- `Department.minStaffing Int?` **exists but is unenforced** — no check in `core/`, `lib/leave`, or `lib/approvals` (a v2 placeholder, Epic 10.3 deferred).
- No `Department.maxLeavePerDay`, no staff-pair restriction model.
- Day-counting is region-aware and pure: `core/calendar.countDays(start,end,mode,cal)` over a `RegionCalendar {weekendDays, holidays}`; the request/approval gates live in `core/leave.validateLeaveRequest`, `core/approvals.decideLeave`, with services `lib/leave.previewLeave/submitLeave` and `lib/approvals.decideLeaveRequest`. Audit is `recordAudit(client,…)` writing `AuditEvent` (ADR-0006).

We need to decide **how strongly** each control enforces, the **day semantics**, and the **new data**, without touching the locked allowance engine and keeping `core/` pure.

## Decisions

1. **Two strengths, deliberately different.** Coverage is **advisory**; clash is a **hard gate**.
   - **Coverage (`Department.minStaffing`, `Department.maxLeavePerDay`)** is computed **per working day** across the request range via `core/calendar` (half-day aware; weekends/holidays excluded). Only leave types with **`affectsStaffingLevels = true`** count toward a day's headcount. A breach is surfaced as a **warning** in the request preview *and* on the approval screen, but does **not** hard-block: the approver/HR may proceed, and approving past a breach records the breach on the `LEAVE_APPROVE` audit entry. Rationale: staffing minimums are a judgement call and **approval is the authz gate** — WhosOff's hard refusal frustrates legitimate exceptions; OU7 prefers *visible + audited* over *blocked*. `null` on either field = no check.
   - **Clash (`StaffRestriction`)** is a **hard block at approval**: a request cannot be **approved** if it overlaps a restricted counterpart's `PENDING` or `APPROVED` leave on a **shared working day**. It is **warned** at preview so the requester sees it early. **HR may override** with a recorded reason (audited); a non-HR approver cannot. Restrictions are **bidirectional** (a `reverse`/`bidirectional` flag, matching WhosOff's "add reverse entry").

2. **Pure checks in `core/`, wired at the existing hook points.** Add pure, exhaustively unit-tested functions (`assessCoverage`, `assessClash`) — new params on the existing `core/leave.validateLeaveRequest` (preview → warnings) and `core/approvals.decideLeave` (approval → hard gate for clash, warning for coverage). Tests cover overlap, half-days, weekends/holidays, and the `affectsStaffingLevels` filter. No change to allowance math.

3. **Schema (additive, defaulted — safe on existing rows):**
   - `Department.maxLeavePerDay Int?` (new). `Department.minStaffing` already exists.
   - `LeaveType.affectsStaffingLevels Boolean @default(true)` — existing types count by default; HR excludes ones like *Out of Office*.
   - `StaffRestriction { id, employeeAId, employeeBId, bidirectional Boolean @default(true), reason String?, createdById, createdAt }` — HR-managed; symmetric lookup; `STAFFRESTRICTION_CREATE` / `_DELETE` audited.

4. **Config-as-data + audit.** All thresholds and restrictions are HR-editable data (ADR-0008), never hard-coded; every change and every override is audited (ADR-0006).

## Consequences

- Additive migrations only; existing behaviour unchanged until HR sets a threshold or a restriction.
- Coverage breaches are **visible and audited** without blocking legitimate approvals; clash is **prevented where it counts** (approval) with an HR escape hatch.
- `core/` stays pure and region/Dubai-aware; the allowance engine is untouched.
- **Out of scope:** suggesting alternative dates, cross-department coverage pools, and blocking at *submit* time (the gate is approval).

## Alternatives considered

- **Hard-block coverage at submit** (WhosOff's model) — rejected: too rigid, denies the approver judgement, and frustrates legitimate exceptions; advisory + audit gives the same visibility.
- **Clash as advisory only** — rejected: Eddy wants real prevention; a soft warning wouldn't stop a coverage clash.
- **Single directional restriction row** — rejected in favour of a `bidirectional` flag so one entry protects both people (mirrors WhosOff "reverse entry").
