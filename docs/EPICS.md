# Epics & User Stories

The build backlog for OU7, organised into 16 epics. Each story is written so a human or AI engineer can pick it up, build it, and verify it against the acceptance criteria. Stories use **MoSCoW** priority (Must/Should/Could) and map back to PRD sections.

**Legend:** AC = acceptance criteria · P1/P2/P3 = phase · ▶ = depends on.

---

## Epic 1 — Foundation, Auth & App Shell · P1

**Goal:** A deployable, themed, secure skeleton everyone builds on.
**PRD:** §5, §8, §9, §10. **Depends on:** —

- **1.1 (Must) Repo & toolchain.** Scaffold the Next.js + TypeScript + Tailwind app per ARCHITECTURE §4.
  - AC: `app/`, `core/`, `lib/`, `components/`, `prisma/`, `tests/` exist; strict TS; lint + format configured; `docker-compose` runs app + Postgres locally.
- **1.2 (Must) CI pipeline.** GitHub Actions: typecheck, lint, unit, integration (Postgres service + migrations), e2e, build.
  - AC: PR cannot merge unless all checks pass; Vercel preview deploy generated per branch.
- **1.3 (Must) Google SSO.** Auth.js + Google OIDC, restricted to the company domain.
  - AC: only `@interestingtimes.me` accounts can sign in; external Google accounts rejected; no self-registration; session times out (idle + absolute).
- **1.4 (Must) RBAC guard.** Central authorization wrapper for every route handler / server action.
  - AC: actions resolve role (Staff/Approver/HR) + approver assignments server-side; unauthorized calls return 403; covered by tests.
- **1.5 (Must) App shell + theming.** Authenticated layout (nav, header, account menu) wired to design tokens.
  - AC: shell renders role-aware navigation; light **and** dark themes work; matches DESIGN-SYSTEM.md.
- **1.6 (Must) Optional MFA.** TOTP enrolment, enforceable per role.
  - AC: HR role can be required to use MFA; enrolment + challenge flow tested.

---

## Epic 2 — Employees, Profiles & Provisioning · P1

**Goal:** Every employee exists, with the right attributes, synced from Google.
**PRD:** §5.3, §6.2. **Depends on:** ▶ Epic 1

- **2.1 (Must) Google Directory sync.** Auto-create/update employees from Google Workspace Directory.
  - AC: scheduled sync creates new users, updates names/email/photo, and respects suspensions/removals (deactivate, never delete); manual "sync now" available to HR.
- **2.2 (Must) Employee profile — HR-managed fields.** Base/region, department, tags, employee type (Full-time/Flex), joining date, manager, approver(s), work pattern.
  - AC: HR can edit these; a leave profile is only generated once base, joining date and manager are set.
- **2.3 (Must) Employee profile — self-editable fields.** Title/names, work & mobile phone, profile photo, default wall-chart view & sort, email format, MFA, link Google.
  - AC: employee can edit only their own permitted fields; HR-managed fields are read-only to staff.
- **2.4 (Must) Roles & approver assignment.** Assign Staff/Approver/HR and approver permission level (Approver / +Add Leave / +Add+Edit/Cancel).
  - AC: changing a role updates permissions immediately; audit recorded.
- **2.5 (Should) Deactivation/offboarding.** Deactivate on exit; retain history; revoke access.
  - AC: deactivated user cannot sign in; their historical leave remains in reports and wall chart history.

---

## Epic 3 — Leave Types & Policies · P1

**Goal:** HR defines the leave types and their rules without code changes.
**PRD:** §6.4. **Depends on:** ▶ Epic 1

- **3.1 (Must) Leave-type CRUD.** Create/edit/retire leave types with: name, code, colour, deducts-allowance flag, paid/unpaid, region availability, wall-chart visibility, active flag.
  - AC: seed set loads (Vacation, Sick Working, Sick Not Working, Bereavement, Maternity, Paternity, Wedding, National Holiday, OOO); retiring a type keeps historical records intact; "Compensation OFF" is absent.
- **3.2 (Must) Conditional requirements per type.** Note-required and attachment-required rules.
  - AC: Vacation needs no note; Sick requires a note; Sick > 2 days requires a medical-report upload; Bereavement requires an official-document upload; rules enforced at request time.
- **3.3 (Should) Per-type annual cap.** Optional limit (e.g. ≤ N sick days/year).
  - AC: when set, booking beyond the cap for that type is blocked with a clear message.

---

## Epic 4 — Allowance & Entitlement Engine · P1 (critical path)

**Goal:** Correct, explainable balances for every employee, every market. Pure `core/` logic, exhaustively tested.
**PRD:** §6.5. **Depends on:** ▶ Epic 2, Epic 3

- **4.1 (Must) Balance computation.** `Remaining = Opening + Carry-over + Adjustments − Approved-taken − Deductions`; `Available = Remaining − Pending`.
  - AC: unit tests cover positive/zero/boundary cases; values match worked examples; computed, never hand-stored.
- **4.2 (Must) Upfront entitlement + pro-rata.** Full annual allowance granted at year start; mid-year joiners pro-rated by joining date.
  - AC: a joiner on 1 Jul with 26-day policy receives the correct pro-rated opening; no monthly accrual anywhere.
- **4.3 (Must) Per-market carry-over.** HR configures each region's rule: cap + expiry, or none.
  - AC: at year roll-over, unused days carry up to the region's cap and expire on its date; excess forfeited; per-region tests pass.
- **4.4 (Must) Region-aware working-day counting.** Weekends/holidays differ per market.
  - AC: day counts for a date range are correct for UAE, KSA, Beirut, Remote; half-days count as 0.5; holidays excluded.
- **4.5 (Must) Over-booking block.** Available can never go negative.
  - AC: a request exceeding Available is rejected at preview; no borrowing.
- **4.6 (Must) Adjustments & deductions.** HR manual +/- with reason; unpaid leave increases deductions.
  - AC: adjustments change Remaining and are audited; unpaid leave reduces effective allowance.
- **4.7 (Must) Reset/Add Balance (HR).** Auto-calculate from base + joining date + factors.
  - AC: HR action produces the same numbers as the engine; no manual maths required.
- **4.8 (Must) Base-change handling.** End-date the old allowance period, open a new one under the new region's rules.
  - AC: changing an employee's base creates a new period; old requests stay linked to the old period; no recompute conflicts.
- **4.9 (Should) Year-end archival.** Snapshot each employee's yearly record.
  - AC: scheduled job stores opening/taken/remaining/carry-over/adjustments/sick-working/sick-not-working per year.

---

## Epic 5 — Leave Request & Approval Workflow · P1

**Goal:** Book leave in a couple of clicks; route it to the right approver; keep balances honest.
**PRD:** §6.3. **Depends on:** ▶ Epic 4

- **5.1 (Must) Request intake.** Type, start date, duration (All day / Half day / Multi-day), notes.
  - AC: hourly leave is not offered; multi-day asks for an end date; conditional note/upload rules (Epic 3) enforced.
- **5.2 (Must) Check-details preview.** Show working vs free days, allowance impact, and validation before submit.
  - AC: preview shows "N day(s) will be removed on approval"; blocks overlaps ("Leave already requested…") and over-booking; respects region calendar, restricted days and min staffing.
- **5.3 (Must) Submit → Pending.** Create the request and notify the approver.
  - AC: status = Pending; allowance shown as pending (debited only on approval); approver notified (email + Teams DM).
- **5.4 (Must) Approve / Decline.** Approver decides with optional comment.
  - AC: approve debits allowance via the engine and notifies requester; decline notifies with reason; appears/updates on wall chart.
- **5.5 (Must) Approval routing.** Single primary approver default; optional multi-level; HR always a fallback.
  - AC: multi-level can be required per type/department; if the approver is unavailable/unresponsive past threshold, HR can act; auto-escalate to HR after N days pending.
- **5.6 (Must) Cancellation rules.** Per policy.
  - AC: staff can cancel pending requests before the cut-off (one day before start); cannot self-cancel on the day; approved last-day cancellations require HR.
- **5.7 (Should) Send reminder.** Nudge the approver on a pending request.
  - AC: manual reminder sends a notification; follow-up count increments.

---

## Epic 6 — Team Wall Chart · P1

**Goal:** See who's off at a glance, filtered any way.
**PRD:** §6.6. **Depends on:** ▶ Epic 5, Epic 10

- **6.1 (Must) Month grid.** Employees as rows, days as columns, "Today" highlighted.
  - AC: leave renders as colour blocks with letter codes + legend; half-days render as half-filled cells; multi-day spans; non-working/restricted days marked.
- **6.2 (Must) Grouping & filters.** Group by Company/Department/Tag/Region; filter by leave type and name; sort by name/department.
  - AC: filters combine correctly; default scope configurable per org/role; all-department visibility supported.
- **6.3 (Must) Navigation.** Year/Month selectors + Prev/Next.
  - AC: navigating re-queries and re-renders correctly.
- **6.4 (Should) Export & print.** CSV export and a print-friendly view.
  - AC: export reflects current filters; print view is legible.
- **6.5 (Should) Privacy.** Wall chart shows type/availability, not private notes.
  - AC: notes/attachments never appear on the wall chart.

---

## Epic 7 — My Leave · P1

**Goal:** Each person sees and manages their own record.
**PRD:** §6.7. **Depends on:** ▶ Epic 5

- **7.1 (Must) History list.** Columns From/To/Duration/Free/Working/Allowance/Details/Type/Options with totals + pagination.
  - AC: filter by view/date-range/decision/type; colour-coded; pending visually distinct.
- **7.2 (Must) Row actions.** Cancel (per rules) and Send Reminder (pending).
  - AC: actions enforce cancellation rules; reminder notifies approver.
- **7.3 (Must) Allowance panel.** Per-year Opening / Remaining / Pending / Available.
  - AC: matches the engine; multiple year periods shown.
- **7.4 (Should) Export/print** own leave.
  - AC: CSV + printable report.

---

## Epic 8 — Dashboard · P1

**Goal:** A useful landing page.
**PRD:** §6.1. **Depends on:** ▶ Epic 4, Epic 5

- **8.1 (Must) Allowances widget.** Donut + breakdown (Opening / Pending / Available).
  - AC: numbers match the engine; updates after booking/approval.
- **8.2 (Must) Next 7 days.** Working/non-working + booked leave per day.
  - AC: reflects the employee's work pattern and region.
- **8.3 (Must) Request-leave widget.** Quick entry to the request flow.
  - AC: launches the Epic 5 flow pre-scoped to the user.
- **8.4 (Should) Customisation + approver widget.** Arrange widgets; pending-approvals shortcut for approvers.
  - AC: layout persists per user; approvers see a pending count with quick actions.

---

## Epic 9 — HR / Admin Console · P1

**Goal:** HR controls everything from one place.
**PRD:** §6.8. **Depends on:** ▶ Epic 2, Epic 3, Epic 4

- **9.1 (Must) Employee management.** Create/edit/deactivate; set all HR-managed fields; bulk import.
  - AC: see Epic 2; bulk import validates and reports errors.
- **9.2 (Must) Allowance management.** View/edit periods; Reset/Add Balance; manual adjustments with reason.
  - AC: uses the engine; every change audited.
- **9.3 (Must) Add leave on behalf.** Create leave for an employee (e.g. unpaid, manager-requested).
  - AC: unpaid leave added as unapproved; on HR approval the employee is notified; respects permission level.
- **9.4 (Must) HR logs (OOO/WFH).** Private records that don't notify.
  - AC: log appears on wall chart per config; no employee notification; visible to HR only.
- **9.5 (Must) Configuration hub.** Leave types, departments, regions/bases, tags, approval routing & levels, branding/theme, notification settings.
  - AC: changes take effect without a deploy; audited.
- **9.6 (Should) Company pending queue.** All pending requests across the org.
  - AC: HR can filter, approve/decline, and see time-in-pending.

---

## Epic 10 — Public Holidays & Regional Calendars · P1

**Goal:** Each market's calendar is correct.
**PRD:** §6.9. **Depends on:** ▶ Epic 1

- **10.1 (Must) Region weekends + holiday calendars.** Per region (UAE/KSA/Beirut/Remote).
  - AC: weekends and holidays per region drive day-counting and the wall chart; holidays auto-excluded from deductions.
- **10.2 (Must) Restricted/blackout days.** Company/department/region scope.
  - AC: booking on a restricted day is blocked or flagged per config.
- **10.3 (Should) Minimum staffing levels.** Per department.
  - AC: requests that would breach minimum staffing are warned/blocked per config.
- **10.4 (Should) Holiday import/clone.** Per year per region.
  - AC: HR can clone last year's calendar and edit.

---

## Epic 11 — Notifications (Email + Teams) · P1

**Goal:** The right people hear about the right things, automatically.
**PRD:** §6.10. **Depends on:** ▶ Epic 5

- **11.1 (Must) Event notifications.** Requested → approver; Approved/Declined → requester; reminders; unpaid approved → employee.
  - AC: email sent with correct content; HR-only logs never notify; per-user email format respected.
- **11.2 (Must) Teams direct messages.** Personal notifications via Microsoft Graph API.
  - AC: DMs delivered to individuals; behind a feature flag until the Azure app + admin consent are in place; email remains the fallback.
- **11.3 (Must) Weekly Who's-Off digest.** Every Friday AM, Asia/Dubai.
  - AC: digest of who's off next week posts to the designated channel/group chat; templated (no AI); schedule honours Dubai time.

---

## Epic 12 — Reports & Analytics · P2

**Goal:** Turn data into the reports HR already relies on.
**PRD:** §6.11. **Depends on:** ▶ Epic 4, Epic 5

- **12.1 (Must) Balance report.** Staff allowances & balances; printable/exportable.
  - AC: filter by department/region/date; export CSV/PDF.
- **12.2 (Should) Quarterly report.** Jan/Apr/Jul/Oct 5, Dubai time.
  - AC: under-utilisation (<25% target), departments below target, requests pending >7 days, high follow-up counts — all from fixed thresholds, no AI.
- **12.3 (Should) Annual consumption + rule-based analytics.**
  - AC: department utilisation, under-utilisers (>70% remaining), sick-leave trends; deterministic.
- **12.4 (Could) Scheduled report delivery.** Email/Teams.
  - AC: reports can be scheduled and delivered to chosen recipients.

---

## Epic 13 — Calendar Feeds & Notion Export · P2

**Goal:** Get data out cleanly to the tools people already use.
**PRD:** §6.12. **Depends on:** ▶ Epic 5

- **13.1 (Must) iCal feeds.** Per user / department / company.
  - AC: subscribable in Google Calendar/Outlook; reflects approved leave.
- **13.2 (Must) Notion export (one-way).** Push balances + leave records + employee summary to a Notion database.
  - AC: on-demand button **and** scheduled export; app never reads from Notion; failures retried and logged.
- **13.3 (Should) Google Calendar push.** Approved leave to Workspace calendars.
  - AC: approved leave appears; cancellations remove the event.
- **13.4 (Should) Generic export API.** CSV/JSON the Notion export and others consume.
  - AC: one documented, versioned interface.

---

## Epic 14 — Public API & Webhooks · P3

**Goal:** Let future tools integrate safely.
**PRD:** §6.12, §3.2 (Phase 3). **Depends on:** ▶ stable core

- **14.1 (Could) Versioned REST API.** Read endpoints for leave/balances/employees.
  - AC: authenticated, versioned, documented; rate-limited.
- **14.2 (Could) Webhooks.** Emit events (requested/approved/declined).
  - AC: subscribers receive signed payloads; retries on failure.

---

## Epic 15 — Design System & Theming · P1 (runs from Phase 0)

**Goal:** A consistent, on-brand (17) UI in light and dark.
**PRD:** §8.2. **Depends on:** ▶ Epic 1 (and feeds every UI epic)

- **15.1 (Must) Token layer.** Implement `design/tokens.css` (light + dark) per DESIGN-SYSTEM.md.
  - AC: all colour/type/spacing come from tokens; no hard-coded hex in components.
- **15.2 (Must) Core components.** Button, input, select, date picker, table, tag/status pill, modal, toast, calendar grid cell.
  - AC: each works in both themes, is keyboard-accessible, and meets contrast AA.
- **15.3 (Must) Theme switch + system preference.**
  - AC: user can pick light/dark/system; choice persists; respects OS setting by default.
- **15.4 (Should) Leave-type & status colour mapping.** Categorical leave-type palette + status semantics (pending/approved/declined).
  - AC: colours are distinct, accessible, and consistent across wall chart, My Leave and reports.

---

## Epic 16 — Platform, Quality, Audit & Migration · continuous + P1 cutover

**Goal:** Keep it reliable, auditable, and get off WhosOff cleanly.
**PRD:** §6.13, §8, §11. **Depends on:** spans all epics

- **16.1 (Must) Audit log.** Immutable record of admin actions + approvals.
  - AC: who/what/when/before/after captured; HR-viewable; tamper-evident.
- **16.2 (Must) Integrity checks.** Scheduled job flags missing manager/approver, orphaned records, mismatched years.
  - AC: produces an error report; surfaced in the admin console.
- **16.3 (Must) Backups & restore.** Automated daily backups; periodic restore drill.
  - AC: documented restore runbook; a test restore succeeds.
- **16.4 (Must) Migration from WhosOff.** Import employees, departments, allowances, historical + pending leave, holidays.
  - AC: one-time HR data collection fills gaps; integrity report clean; sample of ≥10 employees reconciles to WhosOff.
- **16.5 (Must) Parallel run & cutover.**
  - AC: run alongside WhosOff for one cycle; weekly report output matches; then freeze WhosOff, switch SSO, decommission subscription.
- **16.6 (Should) Observability.** Health checks, error monitoring, structured logs, alerting.
  - AC: failures alert the team; dashboards show job success/failure.

---

## Coverage check (every PRD module has an epic)

Auth/SSO → E1 · Provisioning/Profiles → E2 · Leave types → E3 · Allowances → E4 · Request/Approval → E5 · Wall chart → E6 · My Leave → E7 · Dashboard → E8 · HR admin → E9 · Holidays/Regions → E10 · Notifications → E11 · Reports → E12 · Calendar/Notion → E13 · API → E14 · Design → E15 · Audit/Integrity/Migration/Ops → E16. **Overtime: intentionally excluded. AI: excluded everywhere.**
