# Product Requirements Document — Internal Leave & Absence Management Platform

**Working name:** "OU7 WhosOff" (internal replacement for WhosOff)
**Owner:** Adwin Alias (Transformation) · **Sponsor:** HR (Interesting Times DMCC)
**Status:** Draft v1.0 for review · **Date:** 8 June 2026
**Purpose of this document:** Define everything required to design, build, host and extend a self-hosted replacement for WhosOff so that Interesting Times owns its data, controls its roadmap, and stops paying a per-seat subscription.

---

## 1. Executive summary

Interesting Times currently runs leave management two ways: a paid **WhosOff** SaaS account (`app.whosoff.com`, company "Interesting Times DMCC") and a parallel **Notion-based build** (databases + n8n automations + a "WhosOff Management Agent") that the HR and Transformation teams created to extend WhosOff's behaviour and pull data into Notion.

This PRD specifies a single, **purpose-built internal application** that:

- Reproduces WhosOff's leave feature set (leave requests, approvals, allowances, team wall chart, reporting, calendar feeds). **Overtime/TOIL is intentionally excluded.**
- Folds in the custom behaviour HR already values from the Notion build (regional bases, conditional document uploads, automated weekly/quarterly/annual reports, integrity checks, HR admin actions).
- Logs everyone in with their **Google Workspace account** (every employee has one).
- Separates **Admin (HR/Super User)** from **Staff/Approver** access, with unlimited user provisioning.
- Is **reliable and extensible** — new features and design changes can be added later without breaking the platform.
- Is **cloud-hosted but containerised**, so it can move to the on-prem server at any time and the data always belongs to Interesting Times.

### Confirmed decisions (from kickoff)

| Decision | Choice |
|---|---|
| Build approach | **Fully custom build** (bespoke, maximum control and extensibility) |
| Hosting | **Vercel** for the web app (already paid for) + **managed PostgreSQL**; domain logic kept containerisable so it can move to the on-prem server later |
| Authentication | **Google Workspace SSO** (primary), optional MFA |
| Notification channels | **Email + Microsoft Teams** |
| Independence | **Standalone app — no Notion agents, no n8n, no Notion as input.** The current Notion build is retired at cutover |
| Notion role | **Export destination only** — admin/system data is pushed *to* Notion for downstream calculations |
| Allowance model | **Full annual entitlement granted upfront** each year (pro-rated for new joiners); no monthly accrual |
| Approvals | **Single primary approver** by default, **optional multi-level** path, **HR always the fallback approver** |
| Notion export | **Both on-demand (button) and scheduled** |
| Calculations | **All logic is deterministic software — no AI/ML in the running app** |
| Overtime | **Out of scope** — the app manages leave/absence only |
| Carry-over | **Configurable per market/region by HR** (cap + expiry, or none) |

---

## 2. Background & context

### 2.1 Why replace WhosOff

- **Cost:** recurring per-user subscription that grows with headcount.
- **Data ownership:** leave, allowance and employee data sit in a third-party SaaS. The org wants the data on infrastructure it controls.
- **Extensibility:** the team already hit WhosOff's limits and rebuilt parts in Notion. They want to add features (HR notifications, balance auto-reminders, integrity checks, richer reporting) on their own terms.
- **Design control:** the team wants to be able to restyle and rebrand the app freely.

### 2.2 What exists today (sources for this PRD)

**Live WhosOff account** (walked through directly for this PRD). Company: *Interesting Times DMCC*. The account in hand is a Staff/Approver login (Adwin), approved by Mo Alghossein. Captured screens: Dashboard, WhosOff wall chart, My Leave, Request Leave flow, Submit Overtime, My Details/Settings (incl. Google Social Sign-On and MFA).

**Notion build & meetings** (HR's valued behaviours):

- *Leave Management & Workflow System Training* (16 Dec 2025) — HR admin actions, regional bases, allowance auto-calculation, base-change handling, new-employee setup, notifications.
- *Who's Off System Testing & Feedback* (20 Jan 2026) — UI feedback: My Requests / Team Approvals / Department Overview tabs, all-department visibility with filtering, conditional notes (sick/bereavement uploads), cancellation rules, upcoming-leaves display, automated weekly reports.
- *WhosOff Management Agent* spec — auto-transfer of requests, referential integrity, year-end archival, and weekly/quarterly/annual/error reports (Dubai timezone).
- Teams/HR threads — HR notification system (birthdays, probation, anniversaries), auto-reminders for unused leave balances.

### 2.3 Organisation shape (from the live account)

- **Departments (13):** Admin, CEO, Creative, Engagement, Finance, HR, IT, Management, Media, Operation, Planning, Social Media, Technology.
- **Bases / regions:** UAE, KSA, Beirut, Remote — each with its own weekend pattern and public-holiday calendar.
- **Employee types:** Full-time, Flex.

---

## 3. Goals & non-goals

### 3.1 Goals

1. Feature parity with WhosOff (leave/absence; overtime excluded) for staff, approvers and HR super users.
2. Mandatory Google Workspace SSO restricted to the company domain.
3. Two-tier access (Admin/HR vs. Staff), with approver permission levels in between.
4. Region-aware allowance, weekend and public-holiday handling (UAE/KSA/Beirut/Remote).
5. Automated reporting and notifications (email + Teams) matching the current cadence.
6. A modular, well-tested architecture that supports safe future changes and theming.
7. Self-hosting on cloud with a clear, tested path to on-prem.

### 3.2 Non-goals (for v1)

- Full HRIS (payroll, performance, recruiting). Salary/promotion workflow stays in its current home unless later prioritised.
- Native mobile apps (the web app must be responsive; native apps are a later option).
- Public/customer-facing surfaces. Internal tool only.
- Migrating the Notion knowledge base. Only leave/allowance/employee data is in scope for migration.
- **No runtime dependency on Notion or n8n.** The app is fully self-contained; the existing Notion/n8n "WhosOff" build is **retired at cutover**. Notion is used only as a one-way **export target** for admin data (see §6.12) — the app never reads from Notion.
- **Overtime / TOIL tracking is out of scope.** The app manages leave and absence only.
- **No AI/ML in the running product.** Every calculation — allowance maths, day-counting, conflict detection, reports, reminders — is deterministic, rule-based software. (AI tooling may help *build* the app; the running app contains none.)

---

## 4. Personas & roles

| Persona | Description | Primary needs |
|---|---|---|
| **Staff (Standard user)** | Every employee | Book leave, see balances, view team availability, submit overtime, manage own profile |
| **Approver / Manager** | Department heads / line managers | Everything Staff can do + approve/decline leave & overtime for assigned staff, see their team's calendar and pending queue |
| **HR / Super User (Admin)** | HR team | Full control: manage employees, allowances, leave types, departments/regions, public holidays, approval routing, reports, system configuration, branding |

### 4.1 Approver permission levels (mirrors WhosOff)

- **Approver** — approve/decline leave & overtime for assigned staff.
- **Approver + Add Leave** — also create leave on behalf of staff.
- **Approver + Add + Edit/Cancel** — also edit and cancel existing leave for staff.

### 4.2 Role & permission matrix (summary)

| Capability | Staff | Approver | HR/Admin |
|---|:--:|:--:|:--:|
| Book/cancel own leave | ✅ | ✅ | ✅ |
| View team wall chart | ✅ (configurable scope) | ✅ | ✅ (all) |
| Approve/decline leave | ❌ | ✅ (assigned) | ✅ (all) |
| Add leave for others | ❌ | ⚙️ (if granted) | ✅ |
| Edit/cancel others' leave | ❌ | ⚙️ (if granted) | ✅ |
| Add HR-only logs (OOO/WFH) | ❌ | ❌ | ✅ |
| Manage allowances / adjustments | ❌ | ❌ | ✅ |
| Manage employees, departments, regions, leave types, holidays | ❌ | ❌ | ✅ |
| Run/print reports | Own only | Assigned staff | All |
| System config & branding | ❌ | ❌ | ✅ |

---

## 5. Authentication, provisioning & access control

### 5.1 Google Workspace SSO (primary)

- Sign-in via **Google OAuth 2.0 / OpenID Connect**.
- **Domain-restricted**: only `@interestingtimes.me` (and any approved secondary domains) accepted; reject external Google accounts.
- First successful sign-in maps to an existing employee record by email; no self-registration.
- Optional **email/password fallback** for break-glass/admin only (off by default).

### 5.2 MFA

- Optional org-enforced **Multi-Factor Authentication**, configurable per role (e.g., required for HR/Admin). WhosOff already exposes an MFA setting; preserve this.

### 5.3 Provisioning & de-provisioning

- **Unlimited users** (no per-seat cost).
- **MUST — auto-sync from Google Workspace Directory:** employees are created and kept up to date automatically from the directory. HR still completes leave-specific fields (base/region, joining date, manager) before a leave profile is generated.
- Accounts activate on first Google sign-in.
- De-provisioning: deactivate (not delete) on exit; retain historical records; revoke access immediately. Sync respects directory suspensions/removals.

### 5.4 Session & security

- Short-lived access tokens + refresh; idle and absolute session timeouts.
- All actions authorised server-side against role + approver assignments (never trust the client).

---

## 6. Functional requirements by module

> Convention: **MUST** = required for v1; **SHOULD** = strongly desired; **MAY** = future/optional.

### 6.1 Dashboard (landing page)

Mirrors the WhosOff dashboard, customisable per user ("Edit my dashboard").

- **MUST** — *Allowances this year* widget: donut showing Available-to-book vs Pending vs Taken, plus a breakdown table (Opening entitlement, Pending leave, Available to book).
- **MUST** — *My next 7 days* widget: each day with working/non-working indicator (work pattern) and any booked leave.
- **MUST** — *Request leave* quick-form widget (see 6.3).
- **SHOULD** — Drag/arrange/toggle dashboard widgets; persist per user.
- **MAY** — Approver widget: pending approvals count and quick actions.

### 6.2 Employee directory & profiles

Each employee has a profile composed of **self-editable** and **HR-managed** sections.

**Self-editable (Staff):**

- Personal details: Title, First, Middle, Last name.
- Contact details: Tel (Work), Tel (Mobile).
- Account settings: default wall-chart view, default sorting, email notification format (HTML/plain), profile picture, link Google account, MFA.

**HR-managed (Admin only):**

- Work email (login identity), employee type (Full-time/Flex), **base/region** (UAE/KSA/Beirut/Remote), **joining date**, **direct manager**, **department**, **tags**, **approver(s)**.
- **Work pattern** (which weekdays are working days; region-driven default, overridable).
- Allowance periods (see 6.5).

**Rules:**

- **MUST** — New employees are not bookable until email, base, joining date and manager are set (prevents the data-integrity issues HR flagged).
- **MUST** — Profile is the single source of truth that allowances, wall chart and reports read from.

### 6.3 Leave request & approval workflow

**Intake form (from live app):**

- *What type of leave?* — leave-type dropdown.
- *When should it start?* — date picker.
- *For how long?* — **All day**, **Half day**, or **For longer than a day** (multi-day with end date). *(Hourly leave is not offered — a half day is the smallest unit.)*
- *Any notes?* — free text; **conditional requirements** (see below).
- **Check details** → preview step → **Submit leave**.

**Check-details / preview step (MUST replicate):**

- Calculates working days vs free/restricted days in the range.
- Shows allowance impact, e.g. "*N day(s) will be removed from your allowance on approval.*"
- **Conflict detection**: block overlapping requests ("*Leave already requested for these/this date(s)*").
- **MUST — hard-block over-booking:** a request that exceeds the employee's available balance cannot be submitted (clear message; no negative balances, no borrowing from next year).
- Validates against region weekend/holiday calendar and minimum staffing rules.

**Conditional fields (from HR feedback):**

- Notes **not required** for Vacation (don't force unnecessary steps).
- **Sick Leave > 2 days** → require upload of a medical report (record-keeping).
- **Bereavement** → require upload of the official document.
- Notes **required** for sick leave.

**Approval routing:**

- Each employee has a **primary approver** (e.g., Mo Alghossein approves Adwin's *leave*). **Single-approver is the default.**
- **MUST** — optional **multi-level approval** path (department approver → HR/super user), configurable per leave type or department, for cases needing two sign-offs.
- **MUST** — **HR/Super User is always a fallback approver:** if the assigned approver is on leave, unset, or unresponsive past a threshold, HR can approve/decline so requests never stall.
- States: **Pending Approval → Approved / Declined → (Cancelled)**.
- **MUST** — approvers can approve/decline with optional comment; staff are notified.
- **SHOULD** — track follow-up count and time-in-pending; **auto-escalate to HR** after N days pending.

**Cancellation rules (from HR feedback):**

- Staff may cancel a **pending** request any time before the cut-off (one day before start).
- Cannot self-cancel on the day of leave; must contact HR.
- Approved leave on its last day must be cancelled by HR.
- **Send Reminder** action on a pending request nudges the approver.

**Overlap with allowance engine:** allowance is only debited on **approval**, not on request (pending is shown separately).

### 6.4 Leave types & policies

Configurable by HR. Seed set (from the live account):

| Leave type | Notes / behaviour |
|---|---|
| Vacation | Deducts from annual allowance. No mandatory note. |
| Sick Leave Working | Tracked separately; counts toward sick reporting. Note required. |
| Sick Leave Not Working | Tracked separately. Note required; medical report if > 2 days. |
| Bereavement | Requires official-document upload. |
| Maternity | Policy-defined entitlement. |
| Paternity | Policy-defined entitlement. |
| Wedding Leave | Policy-defined entitlement. |
| National Holiday | Region-driven; may be auto-applied. |
| Out Of Office (log) | HR/record use; visible on wall chart, may not deduct allowance. |
| Unpaid Leave / Deduction | Increases "deductions"; reduces effective allowance. |

**Per-leave-type configuration (MUST):** display name, colour/letter code, whether it deducts allowance, whether note required, whether attachment required (and threshold, e.g. sick > 2 days), who can use it, region availability, paid/unpaid, and whether it appears on the public wall chart. The team previously decided to **remove "Compensation OFF"** — leave types must be add/edit/retire-able without code changes.

### 6.5 Allowances & entitlement engine

The most logic-heavy module. Replicates WhosOff allowances plus HR's custom regional logic.

**Allowance period fields:** Start (e.g. "Jan 2026"), Type (Days/Hours), **Opening** entitlement, **Carry-over** from previous year, **Adjustments** (+/-), **Deductions** (unpaid leave), **Public holidays**, **Remaining** (computed), **Pending**, **Available to book** (computed). Track **sick days taken** (working / not working) separately.

**Computation (MUST):**

- **Entitlement model: full annual allowance granted upfront** at the start of each allowance year — **no monthly accrual**.
- `Remaining = Opening + Carry-over + Adjustments − Approved-taken − Deductions`
- `Available to book = Remaining − Pending`
- **Over-booking is hard-blocked:** `Available to book` never goes negative; requests beyond it are rejected at the preview step.
- Leave is booked in **whole or half days only** (no hourly fractions).
- Pro-rata opening based on **joining date** within the year (mid-year joiners get a proportional upfront balance).
- Region-aware working-day counting (weekends differ UAE/KSA/Beirut).
- **Reset/Add Balance** (HR action): auto-calculates allowance from base + joining date + factors, no manual maths.

**Year handling:**

- **Carry-over is configured per market/region by HR:** each region (UAE/KSA/Beirut/Remote) sets its own rule — a **cap** with an **expiry date**, or **no carry-over** at all. Days above a region's cap are forfeited.
- Multiple allowance periods per employee (current + prior years visible).
- **Year-end archival** (HR/automation): snapshot each employee's yearly record (opening, taken, remaining, carry-over, adjustments, sick working/not-working) for compliance history.
- Next-year bookings kept in a separate section from current-year pending.

**Base-change handling (HR requirement):**

- When an employee changes base (e.g. UAE → KSA), **end-date the old allowance period** (marked historical) and **start a new one** with the new region's weekend/holiday rules.
- Old requests link to the old period; new requests to the new period — no recomputation conflicts.

### 6.6 Team wall chart ("WhosOff" view)

The core team-visibility screen.

- **MUST** — Grid: employees as rows (avatar + name), days of the month as columns, "Today" highlighted.
- **MUST** — Leave rendered as coloured blocks with a **letter code + legend** (e.g. "V – Vacation"); **half-days** render as half-filled cells; multi-day leave spans cells.
- **MUST** — Non-working/restricted days marked (e.g. "×"); toggle **Show free/restricted days**.
- **MUST** — Group by **Company / Department / Tag / Region**; filter by **Leave type**, **First/Last name**; **Sort by** first/last name or department.
- **MUST** — Month navigation (Prev/Next), Year & Month selectors.
- **MUST** — **All-department visibility with filtering** (HR explicitly reverted to letting everyone see all departments to check colleague availability). Default scope configurable per org/role.
- **MUST** — **Export data** (CSV) and **Print** the wall chart.
- **SHOULD** — "Show only [those off]" toggle to hide fully-present staff.
- **MAY** — Managers can request to monitor specific people outside their department.

### 6.7 My Leave

- **MUST** — Filter by View (List/Calendar), Date range, Decision (Approved/Pending/Declined/…), Leave type; **Search**.
- **MUST** — Table columns: From, To, Duration, Free, Working, Allowance, Details, Leave type, Options. Colour-coded by leave type; pending visually distinct.
- **MUST** — Row actions: **Cancel** (per rules), **Send Reminder** (pending).
- **MUST** — Totals row; pagination (5/10/25/50/100/All); **Export** and **Print report**.
- **MUST** — Side panel "My allowances" with per-year Opening / Remaining / Pending / Available.

### 6.8 HR / Admin console

The Admin area HR uses to "control everything."

**Employee management (MUST):** create/edit/deactivate employees; set base, department, tag, employee type, joining date, manager, approver(s), work pattern; bulk import; "create leave profile" once data is complete.

**Allowance management (MUST):** view/edit allowance periods; **Reset/Add Balance** auto-calc; manual adjustments with reason; carry-over rules; year-end archival.

**On-beh-of actions (MUST):**

- **Add Leave for employee** (e.g. manager-requested, unpaid, compensation). Unpaid leave is added as an unapproved request; on HR approval the employee is notified.
- **Add Log** — record **OOO / WFH** for tracking; **private to HR**, no employee notification.

**Configuration (MUST):** leave types & rules; departments, regions/bases, tags; **public holidays per region**; **restricted/blackout days**; **minimum department staffing levels**; approval routing & approver levels; company branding/theme; notification settings.

**Oversight (SHOULD):** pending-approval queue across the company; data-integrity dashboard (see 6.12); audit log viewer.

### 6.9 Public holidays & regional calendars

- **MUST** — Per-region holiday calendars (UAE/KSA/Beirut/Remote) and per-region weekend definitions.
- **MUST** — Holidays auto-excluded from allowance deductions and shown on the wall chart.
- **SHOULD** — Import holidays per year per region; clone-and-edit between years.

### 6.10 Notifications (Email + Microsoft Teams)

Channels confirmed: **Email** and **Microsoft Teams**.

**Events (MUST):**

- Leave **requested** → notify approver(s).
- **Approved / Declined** → notify requester.
- **Reminder / follow-up** → nudge approver (manual "Send Reminder" + auto after N days pending).
- Unpaid/compensation leave **approved** → notify employee.
- **Weekly Who's-Off report** (every Friday AM, Dubai time) → team channel: who's off next week, formatted as a friendly digest.

**Events (SHOULD):**

- **Unused-leave reminders** (auto-remind staff with high remaining balance).
- **HR notifications**: birthdays, probation-end, work anniversaries.

**Rules:** HR-only **logs do not notify**. Per-user email format (HTML/plain). All schedules honour **Asia/Dubai** timezone. **Teams notifications are delivered as direct messages to individuals via the Microsoft Graph API** (requires an Azure app registration + admin consent). The weekly Who's-Off digest posts to a designated team channel or group chat *(target to confirm)*.

### 6.11 Reports & analytics

Replicates WhosOff reports plus the Notion "Management Agent" reports.

- **MUST** — **Balance report** (staff allowances & balances), printable/exportable.
- **MUST** — **Weekly Who's-Off** digest (see 6.11).
- **SHOULD** — **Quarterly report** (Jan/Apr/Jul/Oct 5, Dubai time): under-utilisation (< 25% target), departments below target, requests pending > 7 days, high follow-up counts.
- **SHOULD** — **Annual leave-consumption report** + **rule-based analytics** (department utilisation, under-utilisers > 70% remaining, sick-leave trends) — computed from fixed thresholds, **no AI**.
- **SHOULD** — **Data-integrity / error report**: missing manager/approver, orphaned records, mismatched years, sync mismatches.
- **MUST** — All reports exportable (CSV/PDF) and filterable by date range, department, region, leave type.

### 6.12 Calendar feeds & integrations

- **MUST** — **iCal feed** per user / per team (subscribe in Google Calendar / Outlook), matching WhosOff "Calendar Feeds".
- **MUST** — **Admin data export to Notion (one-way, app → Notion):** HR can push system/admin data — employee summaries, allowance balances, leave records — into a Notion database, **both on-demand (a button) and on a configurable schedule**, for downstream calculations. This is the **only** Notion touchpoint and is strictly an **output**; the app never reads from Notion and has no Notion agents or n8n in the loop.
- **SHOULD** — Generic data export (CSV/JSON) and a **versioned REST API + webhooks** so other tools (including the Notion export) consume one clean, documented interface.
- **SHOULD** — Push approved leave to **Google Calendar** (Workspace).
- **SHOULD** — **Microsoft Teams** delivery for notifications/reports.

### 6.13 Audit, logging & data integrity

- **MUST** — Immutable **audit log** of all admin actions and approvals (who, what, when, before/after).
- **MUST** — Automated **integrity checks** (the error-report categories above) on a schedule.
- **SHOULD** — Admin-visible activity history per employee/record.

---

## 7. Data model (logical)

Core entities and key fields (relationships in parentheses):

- **Employee** — id, google_sub, email, title, first/middle/last name, phone(work/mobile), photo, employee_type (Full-time/Flex), status (active/inactive), joining_date, department (→Department), region/base (→Region), tags (→Tag[]), manager (→Employee), approvers (→Employee[]), work_pattern (→WorkPattern), notification_prefs, mfa_enabled.
- **Region/Base** — id, name (UAE/KSA/Beirut/Remote), weekend_days, default_work_pattern, holiday_calendar (→HolidayCalendar).
- **Department** — id, name, min_staffing_level.
- **Tag** — id, name (for grouping/filtering).
- **WorkPattern** — id, per-weekday working flags; supports overrides.
- **LeaveType** — id, name, code, colour, deducts_allowance (bool), note_required (bool), attachment_required (rule, e.g. sick>2d), paid (bool), regions[], visible_on_wallchart (bool), active (bool).
- **AllowancePeriod** — id, employee (→Employee), start, end (nullable), unit (Days/Hours), opening, carry_over, adjustments, deductions, public_holidays, sick_taken_working, sick_taken_not_working, computed: remaining/pending/available; region snapshot (for base-change history).
- **LeaveRequest** — id, employee (→Employee), leave_type (→LeaveType), start, end, duration_mode (DAY/HALF/MULTI), half_day_period (AM/PM), working_days, free_days, allowance_days, notes, attachment, attachment_expires_at, status (Pending/Approved/Declined/Cancelled), approver(s), decision_at, follow_up_count, allowance_period (→AllowancePeriod), created_by (self/HR).
- **HRLog** — id, employee, type (OOO/WFH/other), date(s), notes, private (true), created_by.
- **HolidayCalendar / Holiday** — region, year, date, name.
- **RestrictedDay / Blackout** — scope (company/dept/region), date range, reason.
- **Notification** — recipient, channel (email/teams), event_type, payload, status, sent_at.
- **Report** — type, period, generated_at, payload/link, status.
- **AuditEvent** — actor, action, entity, before, after, timestamp.

---

## 8. Non-functional requirements

### 8.1 Reliability & extensibility (top priority)

- **Modular architecture** with clear boundaries (auth, employees, leave, allowances, overtime, wall chart, notifications, reports, admin) so features are added/changed in isolation.
- **Automated test suite** (unit + integration + end-to-end) gating every change; high coverage on the allowance engine and approval logic.
- **Versioned API** and **database migrations** so schema/feature changes don't break existing data.
- **Feature flags** to roll features out/back safely.
- **CI/CD** with staging environment, code review, and one-click rollback.

### 8.2 Design editability

- **Design-token / theming layer** (colours, type, spacing, logo) editable without touching feature code, so the team can restyle/rebrand freely.
- Component-library-based UI for consistency.

### 8.3 Performance

- Wall chart and dashboard render < 2s for the full company (≈ current headcount, scalable to a few hundred).
- Allowance recomputation is incremental and cached.

### 8.4 Security & privacy

- Google SSO, optional MFA, server-side RBAC, least-privilege.
- Encryption in transit (TLS) and at rest; encrypted backups.
- PII minimisation; attachments (medical/official docs) **access-restricted to HR** and **auto-deleted 2 years after upload**.
- **Data residency / ownership**: data stored on infrastructure the org controls; portable on-prem.

### 8.5 Availability & operations

- Target ≥ 99.5% uptime; automated **daily backups** with tested restore.
- Health checks, error monitoring, structured logs, alerting.

### 8.6 Localisation & time

- All scheduling and date logic in **Asia/Dubai**; display dates as `DD-MMM-YYYY` (matches current UX).
- Multi-region weekend handling baked into the date engine.

### 8.7 Accessibility & responsiveness

- Responsive web (desktop-first, usable on mobile browsers).
- WCAG AA targeted for core flows.

---

## 9. Architecture & technology (recommended)

Fully custom, modular, containerised. Recommended stack (open to team preference):

- **Frontend + app:** **Next.js (React + TypeScript) on Vercel** (already paid for). Component library + design tokens so the team can re-theme/rebrand without touching feature code.
- **API:** Next.js route handlers / server actions for most endpoints. **All domain logic (allowance engine, approval rules, date/region math) lives in a framework-agnostic core module** so it is never locked to Vercel.
- **Database:** **managed PostgreSQL** (e.g. Neon or Vercel Postgres) — relational integrity for allowances/approvals; versioned migrations.
- **Scheduled jobs:** **Vercel Cron** triggers for weekly/quarterly/annual reports, reminders, integrity checks and year-end archival — all **Asia/Dubai**. (If long-running/stateful jobs grow, split them into a small containerised worker service.)
- **Auth:** Google OAuth2/OIDC (domain-restricted) + optional TOTP MFA (e.g. Auth.js).
- **Notifications:** transactional email (Workspace SMTP or SES/Postmark) + Microsoft Teams (Workflows/Incoming Webhook or Graph API).
- **Portability:** the domain core is framework-agnostic and the DB is standard PostgreSQL, so the whole app can be **containerised (Docker) and rehosted on the on-prem server** later. Vercel is the convenient default, not a lock-in.
- **Extensibility:** versioned REST API, webhooks, feature flags, modular boundaries.

**Why this satisfies the goals:** PostgreSQL + a tested allowance engine protects data integrity; Vercel gives near-zero-ops hosting on infrastructure you already pay for; keeping the domain logic framework-agnostic preserves the cloud↔on-prem portability you asked for; design tokens make restyling safe.

> **Resolved:** ship **Vercel-native** now (route handlers + Vercel Cron + managed Postgres) and keep the domain core framework-agnostic so it can be containerised and moved on-prem later if ever needed. On-prem/data-residency is **not** a near-term hard requirement.

---

## 10. Hosting & deployment

- **Phase 1 — Vercel:** deploy the Next.js app to **Vercel** (already paid for) with **managed PostgreSQL** (Neon/Vercel Postgres) and **Vercel Cron** for scheduled jobs. Per-branch preview deployments and instant rollbacks come for free.
- **Portability:** the domain core is framework-agnostic and the database is standard PostgreSQL, so the app can be **containerised and rehosted on the on-prem server** later — Vercel is a convenience, not a lock-in. If long-running/stateful workloads grow, split them into a small containerised service.
- **Environments:** production + staging (Vercel Preview); secrets in Vercel's encrypted env store; automated DB backups with periodic restore drills.
- **CI/CD:** Git push → preview deploy → promote to production; one-click rollback.

---

## 11. Migration plan

1. **Export from WhosOff:** employees, departments, allowances (opening/remaining), historical leave, public holidays.
2. **Collect any missing HR-managed fields directly from HR** (base/region, manager, employee type) as a **one-time** data load — **not** an ongoing Notion link.
3. **Import:** load employees → regions/departments → allowance periods → historical/approved leave → pending leave.
4. **Validate:** run the integrity report; spot-check balances against WhosOff for a sample (≥ 10 employees), reconciling Opening/Remaining/Available.
5. **Parallel run:** operate both for one cycle; compare weekly report output.
6. **Cutover:** freeze WhosOff, switch SSO, announce, decommission subscription.

---

## 12. Roadmap & phasing

**Phase 1 — MVP / parity (must-haves):** Google SSO + roles; employee directory & profiles; leave types + request/approval workflow with conflict detection and conditional uploads; allowance engine with regional logic; wall chart; My Leave; dashboard; HR admin (employees, allowances, holidays, leave types, approval routing); email + Teams notifications; balance report + weekly Who's-Off digest; iCal feeds; audit log; migration.

**Phase 2 — automation & analytics:** quarterly/annual/analytics reports; integrity-check dashboard; unused-leave reminders; HR notifications (birthdays/probation/anniversaries); dashboard customisation; Google Calendar push.

**Phase 3 — extensibility:** public REST API + webhooks; advanced analytics; optional native mobile; optional adjacent HR workflows (e.g. salary/promotion) if prioritised.

---

## 13. Success metrics

- 100% of staff onboarded via Google SSO; WhosOff subscription cancelled.
- ≥ 95% of leave requests submitted and approved in-app (no side channels).
- Weekly/quarterly/annual reports generated automatically with zero manual assembly.
- Allowance discrepancies vs. source = 0 after migration validation.
- New feature shipped to production with no regression (green test suite) — proving extensibility.

---

## 14. Open questions to confirm before build

*Resolved: hosting (Vercel-native, portable); allowance model (full upfront, pro-rated); approvals (single + optional multi-level, HR fallback); Notion export (both on-demand and scheduled; scope = balances + leave records + employee summary); over-booking (**hard-blocked**); provisioning (**auto-sync from Google Workspace Directory**); carry-over (**configurable per market by HR**); part-day (**half/full days only — no hourly leave**); doc retention (**2 years then auto-delete, HR-only**); Teams delivery (**direct messages via Graph API**); salary/promotion (**out of scope**); overtime (**out of scope**); intelligence (**no AI/ML — all deterministic software**).*

Remaining inputs needed from HR (data to supply, not decisions):

1. **Entitlement table:** exact annual opening days per region (UAE/KSA/Beirut/Remote) and per employee type (Full-time/Flex), plus each market's **carry-over rule** (cap + expiry, or none).
2. **Notion target:** which Notion database(s) the export should write to (connect/share them).
3. **Teams setup:** confirm the Azure app registration / admin consent for Graph API DMs, and where the **weekly Who's-Off digest** should post (a team channel or group chat).
4. **Branding:** logo, colour palette, and the app's display name for the theming layer.

---

## 15. Appendix A — WhosOff feature inventory (captured from the live account)

- **Top nav (WhosOff today):** WhosOff (wall chart), My Leave, Request Leave, Submit Overtime. **Side nav:** Dashboard, WhosOff, Leave, Overtime, Tools (Calendar Feeds), Help. *(Overtime menus are **excluded** from our build.)* **Top-right:** Quick Access, Account (My Details/Settings, Sign out).
- **Leave types:** Vacation, Sick Leave Working, Sick Leave Not Working, Bereavement, Maternity, Paternity, Wedding Leave, National Holiday, Out Of Office.
- **Duration modes (our build):** All day; Half day; For longer than a day. *(WhosOff also offers "a couple of hours"; we exclude hourly leave.)*
- **Overtime (NOT being built — out of scope):** WhosOff offers overtime types (Flexi Time, Overtime, Overtime +, Working Time, Other) with start time and hrs/mins. Excluded from our app.
- **Wall chart grouping:** Company / Department / Tag / Region; filters for leave type, name; sort by name/department; show free/restricted days; export & print; month navigation; today highlight; letter-coded colour blocks with legend; half-day rendering.
- **Departments (13):** Admin, CEO, Creative, Engagement, Finance, HR, IT, Management, Media, Operation, Planning, Social Media, Technology.
- **Allowances:** per-year periods with Start, Type (Days/Hours), Opening, Remaining; dashboard breakdown (Opening / Pending / Available to book).
- **Request flow:** select type → date → duration → notes → **Check details** (working days, allowance impact, overlap validation) → **Submit leave** (creates pending).
- **My Leave:** filters (View, Date range, Decision, Leave type), table (From/To/Duration/Free/Working/Allowance/Details/Type/Options), Cancel & Send Reminder, totals, pagination, export & print.
- **Settings:** approver shown ("approves leave & overtime"); account settings (default view/sort, email format, profile picture); **Google Social Sign-On**; **MFA**; personal & contact details.

## 16. Appendix B — Roles reference (WhosOff parity)

- **Staff** — book/manage own leave, view permitted calendars.
- **Approver** — + approve/decline for assigned staff; optional Add Leave; optional Edit/Cancel.
- **Super User (HR/Admin)** — full configuration, all employees, all reports, branding, system settings.

---

*End of PRD v1.0 (draft for review).*
