# OU7 v3 — PRD & Epic Backlog

**Status:** Draft for the hands-off build. **Owner:** Eddy. **Orchestrator:** reads stories from this file (same loop as v2 / `docs/V2-PRD.md`, per [`BUILD-WORKFLOW.md`](BUILD-WORKFLOW.md), ADR-0012).

## What v3 is
v3 closes the gap between OU7 and the **WhosOff admin feature set** (audited in [`WHOSOFF-V3-FEATURE-MAP.md`](WHOSOFF-V3-FEATURE-MAP.md)), fixes the mobile regressions found after v2's Epic 17, and prepares the WhosOff cut-over. It builds on v1 (Epics 1–16) and v2 (Epics 17–24). **v3 epics are numbered 25→33.**

### Scope assumptions (set because the scope question couldn't be captured — override freely)
- **In:** leave-type policy/booking rules; per-type visibility, archive-not-delete, per-type email; coverage controls + staff-vs-staff clash; region-move transition integrity; HR balance-control tooling; public-holiday seeding/import; mobile fixes.
- **"Tag" = leave types** (visibility + archive). A small story (27.4) also brings archive-not-delete to the staff Tags/Groups feature, covering both readings.
- **Go-live & WhosOff data migration (Epic 33) is specced but HUMAN-GATED** — the orchestrator must NOT run it autonomously overnight.

### Confirmed product decisions (from [`ou7-v3-decisions`], this conversation)
- Keep OU7's **region-driven weekend model** (not WhosOff's per-user working schedule). Region is the source of truth; moving markets changes one field.
- **No lieu / TOIL** (overtime stays out of scope).
- Every leave type gets a **visibility** setting (some HR-only).
- **Archive, never hard-delete.**
- Build **staff-vs-staff clash restrictions.**

### Out of scope for v3 (candidates for later)
Overtime and lieu/TOIL (excluded by guardrail); WhosOff Staff Hub / document storage; Bradford Factor; record-absence-on-behalf; billing/invoices/referrals.

## Guardrails (unchanged — see `CLAUDE.md`)
No AI/ML at runtime (ADR-0003); standalone (Notion export-only); Google SSO domain-restricted; region-aware always (`core/calendar`); balances computed via `core/allowance` (never hand-stored — see Epic 31 for how HR still controls them); dependency direction `app/ → lib/ → core/`; config is **data, not code** (ADR-0008); tokens only, light+dark, WCAG AA.

## Definition of Done (v3)
Every story meets the base DoD in [`PROJECT-PLAN.md` §6] **and** the v2 bar in [`V2-PRD.md` §4] (renders 360/640/1024/1920 in both themes, WCAG AA, Core Web Vitals, error/empty/loading states, tokens only, gate green). v3 adds:
- Schema changes ship with a **migration + backfill** and **exhaustive `core/` unit tests** for any new rule; new config is **HR-editable data** (ADR-0008), never hard-coded.
- New enforcement rules (notice/cancellation/coverage/clash/region) are tested in `core/` first, then wired into request preview + approval.
- **One story = one PR, feature branch only.** The merge gate is the GitHub Actions `build-and-test` job.

## ADR gates — now satisfied
- **ADR-0014 — Coverage & clash enforcement** (warn-vs-block model, day/half-day/weekend semantics, `StaffRestriction`): **written & Accepted** (`docs/adr/0014-…`). Epics 28 & 29 may proceed.
- **ADR-0015 — Leave day-count snapshots & effective-dated region moves**: **written & Accepted** (`docs/adr/0015-…`). Epic 30 may proceed. Note: day-count snapshots **already exist** in the schema — see the integration map below.
- Still pause for: **Epic 26.2** (negative notice / booking in the past) if implementation reveals it needs more than a leave-type field, and **Epic 33** (hosting revisit of ADR-0002) — both flagged inline.

## Integration map — verified against the codebase (clash-free)
A read-only analysis confirmed every v3 addition lands cleanly. Key facts the orchestrator should rely on:
- **No schema name clashes.** All new `LeaveType` fields (`requiresApproval`, `noticePeriodDays`, `cancellationWindowDays`, `minLengthDays`, `maxConsecutiveDays`, `allowConsecutive`, `visibility`, `affectsStaffingLevels`), `Department.maxLeavePerDay`, `StaffRestriction`, and `EmployeeRegionAssignment` are **absent today** — pure additions. Migrations must be **additive + defaulted** (existing types default `affectsStaffingLevels=true`, `visibility=EVERYONE`).
- **Already present (activate, don't add):** `Department.minStaffing Int?` (placeholder, unenforced — Epic 28.1 just wires the check); `LeaveType.active` (archive pattern — Epic 27.2 reuses it); `Tag` model with `employees` m2m (Epic 27.4 adds `archived`); `LeaveType.visibleOnWallChart` + non-HR four-category abstraction in `lib/wallchart.ts` (Epic 27.1 extends this server-side filter).
- **Day-count snapshots already exist:** `LeaveRequest.{workingDays,freeDays,allowanceDays}` are persisted at creation (`lib/leave.submitLeave`) and balance math reads them (`lib/allowance`), never recomputing — so Epic 30.1 is mostly *formalize + backfill + guard*; the real new work is 30.2 (effective-dated region).
- **Enforcement hook points (where new checks go):** preview/advisory → `core/leave.validateLeaveRequest` (via `lib/leave.previewLeave`); approval/hard-gate → `core/approvals.decideLeave` (via `lib/approvals.decideLeaveRequest`); cancellation window → extend `core/cancellation.canCancel` (default to today's "strictly before start" when unset). Day semantics use `core/calendar.countDays` + `RegionCalendar`. Audit via `recordAudit(...)` → `AuditEvent` (ADR-0006).
- **Config UI pattern (where new fields surface):** form in `app/(app)/admin/_sections/ConfigSection.tsx` → server action in `app/(app)/admin/config/actions.ts` → `lib/config.ts` → Prisma. `lib/notify` is a console-stub `Notifier` (Epic 27.3 implements the real per-type matrix; a `Notification` model already exists).

## Build phasing (recommended order for the overnight run)
- **Phase A (ship first, no ADR):** Epic 25 (mobile fixes).
- **Phase B (schema-additive, high value, no ADR):** Epic 26, Epic 27.
- **Phase C (ADRs written — proceed):** Epic 28, Epic 29 (ADR-0014); Epic 30 (ADR-0015).
- **Phase D:** Epic 31, Epic 32.
- **Phase E (human-gated, not autonomous):** Epic 33.

---

## Epic 25 — Mobile rendering fixes · P1
**Goal:** the app renders correctly 360–640px; fix the regressions found in the v3 mobile audit (follow-up to Epic 17). **Extends:** Epic 17. **Resolves:** v3 mobile audit (this conversation).

- **25.1 (Must) Fix the app-shell grid collapse.** `app/(app)/layout.tsx:15` sets `gridTemplateColumns:"220px 1fr"` as an **inline style**, which beats the mobile rule `globals.css:86 @media(max-width:640px){.app-shell{grid-template-columns:1fr}}` (no `!important`) — so on phones the empty 220px sidebar track remains and content is crushed. Fix: move `grid-template-columns` out of the inline style into the `.app-shell` CSS rule so the media query overrides naturally (preferred), or add `!important` to match the sibling `.dash-grid`/`.next7-grid` rules.
  - AC: at ≤640px the shell is a single full-width column with no empty sidebar track; content uses the full viewport width; verified at 360/390/640; both themes; no horizontal overflow.
- **25.2 (Must) Wall chart usable on mobile.** `wall-chart/WallGrid.tsx`: reduce name-column + cell min-width below 640px (e.g. ~90px name, ~28px cells); keep the intended horizontal scroll.
  - AC: at 390px a staff row's name plus ≥4 day columns are visible without horizontal scrolling; month still scrolls horizontally; both themes; no regression ≥1024px.
- **25.3 (Should) Pending-approvals row reflow.** `admin/pending/CompanyQueue.tsx`: the fixed `width:150` reason input + non-wrapping action buttons overflow at 390px. Add `flex-wrap` and a responsive input width.
  - AC: no horizontal overflow at 390px; buttons wrap; input remains usable width.
- **25.4 (Should) Admin form grids → single column ≤640px.** `admin/_sections/*` use `minmax(160px,1fr)` grids that are tight on phones.
  - AC: admin forms render single-column at 390px, full-width labels/inputs, no overflow.
- **25.5 (Could) Explicit Next.js `viewport` export** in `app/layout.tsx` (currently relying on the default).
  - AC: `viewport` exported; meta present; no visual change.

## Epic 26 — Leave-type policy & booking rules · P1
**Goal:** per-leave-type booking constraints matching WhosOff. **Extends:** Epic 3 (Leave Types), Epic 5 (Request/Approval), ADR-0008. **Resolves:** WHOSOFF-V3-FEATURE-MAP §5.

- **26.1 (Must) Per-type "requires approval".** Add `LeaveType.requiresApproval`. When false, an in-policy request auto-approves (still audited; still debits per `deductsAllowance`).
  - AC: schema + migration; HR config UI; a no-approval type books straight to APPROVED with an audit entry; over-booking still hard-blocked; core + integration tests.
- **26.2 (Must) Notice period, incl. negative.** Add `LeaveType.noticePeriodDays` (int; may be negative). Positive = must request ≥N days ahead; negative = may book up to N days in the past; 0 = today onward. Enforced in `core/leave` + the request zod schema. *(May need an ADR addendum for past-booking semantics — pause if so.)*
  - AC: exhaustive core tests for negative/zero/positive across weekends/holidays; request blocked/allowed with a clear message; config UI.
- **26.3 (Must) Per-type cancellation window.** Add `LeaveType.cancellationWindowDays`; extends the hard-coded rule (ADR-0011) to per-type config.
  - AC: core rule + tests; UI blocks cancel outside the window with reason; audit; existing ADR-0011 default preserved when unset.
- **26.4 (Should) Minimum length & max consecutive days.** Add `LeaveType.minLengthDays`, `LeaveType.maxConsecutiveDays`; enforce at request.
  - AC: validation + tests; config UI; clear errors; half-day aware.
- **26.5 (Could) Allow-consecutive-bookings toggle.** Add `LeaveType.allowConsecutive`.
  - AC: enforced; tested; config UI.

## Epic 27 — Leave-type visibility, archive & email · P1
**Goal:** control who sees each leave type, archive instead of delete, configurable per-type email. **Extends:** Epic 3, Epic 11 (Notifications). **Resolves:** ou7-v3-decisions; WHOSOFF §5.

- **27.1 (Must) Per-type visibility.** Add `LeaveType.visibility` = `EVERYONE | APPROVERS_SUPERUSERS | HR_ONLY`, governing who sees this type's bookings on wall chart / team views / reports. Staff always see their own.
  - AC: enum + migration; config UI; HR-only types hidden from non-privileged users on wall chart, dashboards, and reports; staff still see their own; server-side authorization (not just UI hiding); tests per scope.
- **27.2 (Must) Archive, not delete, leave types.** Replace destructive delete with archive via `LeaveType.active`; archived types can't be booked, history preserved; UI offers Archive/Restore.
  - AC: no hard-delete path in UI/API; archived types hidden from the request picker; existing leave + reports intact; tests.
- **27.3 (Should) Per-type email matrix.** Extend `lib/notify`: configurable recipients for **request / approval-or-decline / cancellation**, each `None | Staff,approver&notifier | Staff only | Staff & approver | Approver only`.
  - AC: config UI per type; emails dispatched to the configured set; sensible default; mocked tests; no runtime external dep beyond the existing mailer.
- **27.4 (Could) Archive staff Tags/Groups.** Bring archive-not-delete to the staff Tags feature (covers the "tag" reading).
  - AC: archive/restore tags; archived hidden from filters; membership history intact.

## Epic 28 — Coverage controls & staffing levels · P2 · ADR-0014
**Goal:** enforce department coverage. **Extends:** Epic 9 (HR console), Epic 5. **Resolves:** WHOSOFF §3/§5.

- **28.1 (Must) Enforce department minimum staffing.** `Department.minStaffing` exists but is unenforced; warn/block when a booking would drop a department below its minimum present on any working day (per ADR-0014's warn-vs-block decision).
  - AC: `core/` check with exhaustive tests (weekend/holiday-aware via `core/calendar`, half-days, both ledgers); request preview warns; approval enforces; clear message.
- **28.2 (Should) Max leave requests per day per department.** Add `Department.maxLeavePerDay`; enforce.
  - AC: schema + enforcement + tests; UI surfaces remaining slots for a day.
- **28.3 (Should) Per-type "affects staffing levels" flag.** Add `LeaveType.affectsStaffingLevels` so e.g. Out-of-Office doesn't count toward coverage.
  - AC: only flagged types count toward 28.1/28.2; tests.

## Epic 29 — Staff-vs-staff clash restrictions · P2 · ADR-0014
**Goal:** stop designated people being off the same day. **Extends:** Epic 5, Epic 9. **Resolves:** WHOSOFF §4; ou7-v3-decisions.

- **29.1 (Must) Restriction model + HR UI.** New `StaffRestriction` (employeeA, employeeB, bidirectional/reverse flag, reason). HR adds/removes pairs.
  - AC: schema + migration; HR UI; bidirectional handling; audit; tests.
- **29.2 (Must) Enforce at request/approve.** Warn/block when a booking overlaps a restricted counterpart's pending/approved leave on a shared working day (per ADR-0014).
  - AC: `core/` check with exhaustive tests (overlap, half-days, weekends/holidays); request preview + approval; message names the clash while respecting visibility rules.
- **29.3 (Could) Staff-restrictions report** (WhosOff parity).
  - AC: list view of configured restrictions; export.

## Epic 30 — Region-move transition & weekend integrity · P2 · ADR-0015
**Goal:** moving an employee between markets never retroactively recounts past leave. **Extends:** Epic 10 (Regions/Holidays), Epic 4 (Allowance). **Resolves:** region-driven-model decision. **Note:** day-count snapshots **already exist** (`LeaveRequest.workingDays/freeDays/allowanceDays`, persisted at creation, read by `lib/allowance`) — so 30.1 is mostly formalisation; 30.2 is the real new work.

- **30.1 (Must) Formalise & guard the day-count snapshot.** Make the existing "counts are computed once at creation and never recomputed" an enforced invariant (reviewer guardrail; no code path recomputes `allowanceDays` for an existing request); add a safety backfill for any legacy/zero rows.
  - AC: invariant documented (ADR-0015) and guarded; backfill migration populates any zero/legacy `workingDays`/`freeDays`/`allowanceDays`; exhaustive `core/allowance` tests confirm a region change does NOT alter an existing request's balance impact.
- **30.2 (Should) Effective-dated region assignment.** Add `EmployeeRegionAssignment {employeeId, regionId, effectiveFrom}` (keep `Employee.regionId` as the current-region cache). "Region on date D" = latest assignment with `effectiveFrom ≤ D`; new bookings use the region effective on their start date; backfill one row per employee at `joiningDate`.
  - AC: region change captured with effective date + `REGION_CHANGE` audit; wall chart + new bookings respect the boundary; tests for a Beirut→KSA move spanning the change; existing bookings unchanged.
- **30.3 (Could) Integrity check tool.** HR view flagging bookings whose stored day-count differs from a fresh recompute against the region effective on their dates.
  - AC: read-only list + explanation; no auto-mutation.

## Epic 31 — HR balance-control tooling · P3
**Goal:** give HR WhosOff-style control over balances while keeping OU7's computed + audited ledger (no hand-stored numbers; no lieu/TOIL). **Extends:** Epic 24 (multi-year balances, adjustments ledger; ADR-0009/0013), Epic 9. **Resolves:** WHOSOFF §4; "balances should be controllable."

- **31.1 (Should) "Set remaining to X" helper.** HR enters a target Remaining; the tool previews and writes the single typed adjustment that achieves it (spreadsheet-like control, ledger-safe).
  - AC: target → preview implied adjustment + required reason → apply as a typed adjustment; audited; tests; never writes a raw balance.
- **31.2 (Should) Bulk balance prep** (WhosOff "Balance administration"). Set next-year opening by copy-previous-year or fixed value, per department, only where missing.
  - AC: filter by department; preview; apply only to staff without that year's allowance; audited; tests.
- **31.3 (Could) Per-employee allowance log** (WhosOff "Allowance log") — chronological balance-change history.
  - AC: ledger view; export.

## Epic 32 — Public holidays: seed & import · P3
**Goal:** load real holidays (nothing to migrate from WhosOff — none were configured). **Extends:** Epic 10. **Resolves:** WHOSOFF §5.

- **32.1 (Must) Seed UAE / KSA / Beirut holidays** for the current + next year, per region.
  - AC: bundled static seed data per region (no runtime external call — ADR-0003/standalone); appears on calendar + wall chart; idempotent re-run.
- **32.2 (Should) Import-by-region tool.** HR imports a year's public holidays for a region from a bundled dataset.
  - AC: pick region + year → preview → apply; dedupe; audited; no live external dependency.

## Epic 33 — Go-live: hosting, migration & cutover · P3 · **HUMAN-GATED (do not run autonomously)**
**Goal:** production hosting + migrate off WhosOff. **Extends:** Epic 16 (Platform/Migration). **Note:** orchestrator must PAUSE — these stories require human action, secret handling, and sign-off; spec/dry-runs only.

- **33.1 (Must, human-gated) Production hosting.** Vercel + near-region (Gulf) Postgres per ADR-0002 (revisit if a Gulf-region full-stack host is preferred — ADR addendum). Rotate secrets first (Neon password + Google OAuth — see `ou7-secrets-to-rotate`).
  - AC: prod environment, rotated secrets, domain, backups; no secrets in the repo; documented.
- **33.2 (Must, human-gated) WhosOff data import.** Map WhosOff export → OU7: staff, departments, regions, leave types, per-year balances → opening/remaining via typed adjustments (Epic 31), approved leave with snapshot day-counts (Epic 30), working schedules reconciled to the region model.
  - AC: import script with **dry-run + reconciliation report**; idempotent; no destructive prod writes without sign-off.
- **33.3 (Must, human-gated) Parallel run & cutover.** Validate OU7 vs WhosOff for a period; cutover checklist; rollback plan; Eddy sign-off gate.
  - AC: documented parallel-run results; explicit go/no-go sign-off recorded.
