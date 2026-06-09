# Overnight build — notes, skips & stops

Running log of decisions to flag for human review during the unattended Epic 9/10/16 run.
Each entry: what / where / why.

---

## Epic 9.5 — config hub: branding / notifications / multi-level routing — DEFERRED

- **What:** The config hub shipped the **entitlement/carry-over policy** (the 9.1
  dependency), leave types, departments and tags. **Branding settings**, **notification
  settings**, and **multi-level approval routing** config were not built.
- **Where:** `feat/epic-9.5-config` (PR #11); see ADR-0008.
- **Why:** Branding + notification settings depend on **PRD §14 inputs we don't have**
  (brand assets, Teams/Azure) and Epic 11. **Multi-level approval routing is Epic 5.5**,
  explicitly excluded from this run. No guardrail involved — these need inputs/decisions.

## Epic 9.2 — Allowance management (adjustments + Reset/Add Balance) — PLAN ONLY, STOP for review

**Status: not implemented — awaiting human review of this plan (per instructions).**
This is the most balance-sensitive HR write path, so it's left as a plan.

### What 9.2 must do
HR can (a) apply a manual **adjustment** (+/− days, with a reason) to an employee's
allowance, (b) record **deductions** (e.g. unpaid leave) , and (c) **Reset / Add Balance** —
(re)generate a period's `opening` from the entitlement policy + joining date via the engine.
All audited. Balances stay **engine-derived**; we only ever store *inputs* (`opening`,
`carryOver`, `adjustments`, `deductions`) — never a computed Remaining/Available.

### Storage (no schema change needed)
`AllowancePeriod` already has the input columns: `opening`, `carryOver`, `adjustments`,
`deductions`. The engine (`core/allowance.computeRemaining/Available`, already tested) reads
them. So 9.2 is mutations of these inputs + audit — **no migration**.

- **Manual adjustment:** `adjustments := adjustments + delta` (delta may be negative). The
  *reason* is not a column on `AllowancePeriod`; capture it in the **AuditEvent** (`before`/
  `after` + a `reason` field in the payload). If HR needs a first-class adjustments ledger
  later, add an `AllowanceAdjustment` table (employeeId, periodId, delta, reason, actorId,
  createdAt) and sum it into `adjustments` — recommended, but the column approach is the
  minimal correct start. **Flag for the reviewer:** ledger vs running-column is the one real
  product decision here.
- **Deductions:** `deductions := deductions + delta` (same pattern). Unpaid leave already
  flows here conceptually; wiring unpaid-approval → deductions is a separate cross-link
  (note it).

### Reset / Add Balance (the engine-critical part)
`resetBalance(actor, employeeId, year)`:
1. Load employee `regionId`, `role`, `joiningDate`.
2. `policy = getEntitlementPolicy(regionId, role)`. **If null → STOP and flag** (same rule
   as 9.1 — no invented number).
3. `opening = core/allowance.proRataOpening(policy.annualDays, joiningISO, \`${year}-01-01\`,
   \`${year}-12-31\`)` — identical to 9.1, so HR's "Reset" produces the same number the
   engine would (the AC: "produces the same numbers as the engine").
4. Update the period's `opening` to that value (do **not** touch taken/pending — those are
   derived from requests). Leave `carryOver`/`adjustments` unless the reviewer wants Reset to
   zero them (decision below).
5. Audit `ALLOWANCE_RESET` with before/after `{opening, annualDays, joiningISO}`.

"Add Balance" = the same as creating a period when none exists (reuse 9.1's
`generateAllowanceProfile`), so Reset (period exists) and Add (no period) share the engine
call.

### Edge cases to handle
- **No policy** → stop/flag (never invent).
- **No open period** on Reset → treat as Add (create) or error — *reviewer decision*.
- **Over-correction:** an adjustment that pushes Remaining negative should be **allowed to be
  stored** (HR may intentionally claw back) but surfaced as a warning; over-booking on new
  *requests* is already hard-blocked by the engine, and approval re-checks (ADR-0005) catch
  an over-committed balance. Confirm HR wants negative-Remaining to be permitted.
- **Base change (Epic 4.8)** interactions — out of scope here; note that changing region
  should open a new period (separate story).
- **Rounding:** reuse `core/allowance.round`/`roundToHalf`; adjustments in half-day steps.
- **Concurrency:** wrap Reset + audit in a transaction; lock the period row (as approvals do)
  if Reset can race with an approval.

### Tests (when built)
- **Unit (core):** none new — `proRataOpening`/`computeRemaining` already cover the maths;
  add cases only if a new pure helper appears.
- **Integration:** adjustment changes `adjustments` + audited + Remaining recomputed by the
  engine matches expected; deduction likewise; Reset sets `opening == proRataOpening(...)`
  and matches `generateAllowanceProfile`; Reset stops when no policy; negative-Remaining
  warning behaviour.
- **e2e:** HR opens an employee's allowance, applies a +2 adjustment with a reason → the My
  Leave / allowance panel reflects the new Remaining; Reset recomputes opening.

### Why stopped
Per the run brief, 9.2 is **plan-only**; it's the write path most able to corrupt balances,
and it carries a genuine product decision (adjustments **ledger** vs running **column**, and
whether Reset zeroes carry-over/adjustments). Awaiting human sign-off before coding.

---

## Epic 5.6 — owner self-cancel UI + HR-cancel-approved view — DEFERRED (dependency)

- **What:** the cancellation **rule + service** are built and tested (`core/cancellation`,
  `lib/cancellation`, ADR-0011), with an HR Cancel wired into the company pending queue. Not
  built: the **owner self-cancel button in My Leave** and an **HR list of approved leave to
  cancel** (last-day/approved path UI).
- **Where:** `feat/epic-5.6-cancellation`. Those UIs belong in **My Leave (PR #7, unmerged)** —
  a stub on `main`. `lib/cancellation.cancelLeaveRequest` is ready to wire.
- **Why:** building a leave list on the stub would be throwaway and conflict with #7. The
  owner/HR rules are fully exercised by unit + integration tests; the e2e covers the HR queue
  cancel. No guardrail involved — purely not-on-main dependency.

## Epic 9.4 — HR logs on the wall chart "per config" — DEFERRED

- **What:** HR-only OOO/WFH logs shipped (create/list/delete, audited, **no notification**).
  Displaying them **on the wall chart per a visibility config** was not built.
- **Where:** `feat/epic-9.4-hrlogs`. `HRLog.isPrivate` exists; no `showOnWallChart` flag yet.
- **Why:** It needs a schema flag + a `lib/wallchart` change to merge HRLog entries into the
  grid (as a generic OOO/WFH marker, no private notes), which is a wall-chart enhancement
  better done as its own slice. The core 9.4 requirement (private, HR-only, no-notify record)
  is delivered. No guardrail involved.

## Epic 10.3 — Minimum staffing levels — SKIPPED (noted, not built)

- **What:** 10.3 (warn/block requests that would breach a department's minimum present
  headcount) was deferred; 10.1/10.2/10.4 shipped.
- **Where:** `feat/epic-10-calendars` (PR for Epic 10). `Department.minStaffing` already
  exists in the schema; nothing else built for 10.3.
- **Why:** It's not a small add — it needs a per-day "who's present" computation
  (headcount minus approved/pending leave, region-aware) plus a policy for warn-vs-block,
  and ties into the request preview differently from the restricted-day block. It's a
  separable story; bundling it would have bloated the Epic 10 PR. Recommend a dedicated
  story after Epic 9. No guardrail involved.
