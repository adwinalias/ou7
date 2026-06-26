# WhosOff Admin Feature Map — input for OU7 v3

**Purpose.** A complete map of every console, screen, toggle and option exposed at **administrator level** in the live WhosOff account (`app.whosoff.com`, tenant *Interesting Times DMCC*, signed in as Adwin Alias / Super User). This is the reference we feed into the OU7 **v3** pass: what WhosOff actually does today, so we can decide what OU7 keeps, drops, or improves.

**Method.** Walked the whole admin surface in the browser, read-only (no settings changed, nothing saved). Captured each page both visually and from the DOM (form fields, dropdown option sets, table columns) and inspected the markup/URLs directly. WhosOff is an **ASP.NET WebForms** app (`ctl00$cpBodyContent$…` control names); most settings panels render all their tabs into the DOM at once.

**How to read it.** Each section is one console. `→` marks a navigation path or option list. Items flagged **[v3]** are the decisions or gaps worth discussing for OU7. Items flagged **[out of scope]** exist in WhosOff but OU7 deliberately doesn't build them (e.g. overtime, billing).

---

## 1. Navigation structure

**Left sidebar** (icon rail, expands on hover):

- **Dashboard** (`/`)
- **WhosOff** (`/whosoff`) — the wall chart / planner
- **My Staff** (`/my-staff`) — line-manager view
- **Leave** → My leave · Request leave · Record leave (admin only) · Pending leave
- **Overtime** → My overtime · Submit overtime · Record overtime (admin only) · Pending overtime **[out of scope]**
- **Tools** → Calendar feeds
- **Reports** → Reports dashboard · WhosOff · All staff · Overtime · Yearly calendar · Working schedule
- **Administration** → Admin dashboard · Manage staff · Departments · Regions · Tags · Alerts · Leave types · Overtime types · Free/restricted days · Calendar feeds · Company settings
- **Help** → Knowledgebase · User guides · Contact line manager · Contact support

**Top bar:** company name (left); **Quick Access +** and **account menu** (right). Quick Access is a shortcut menu: Submit leave request, Submit overtime entry, and (admin) Record leave, Record overtime, Add/Import staff, Bulk book leave. Account menu: My Details / Settings, Sign out.

---

## 2. Company Settings (`/administration/settings`)

Nine sub-tabs plus Billing/Invoices in the secondary nav.

### Setup
- **General settings:** Account manager (any staff member); Time zone (full IANA list; currently UTC+02:00 Beirut); **Yearly calendar** = the holiday-year start month (Jan–Dec … Dec–Nov) — locks once data exists.
- **Yearly carryover defaults** (used by bulk carryover, overridable per staff): Max carryover (days) = 5; Max carryover (hours) = 0; Carryover expiry (days) = 0.
- **Functionality:** Cross-department view (All staff | Approvers & Super Users | Super users only); Allow overtime area? (Yes/No); **Show Bradford Factor?** (Yes/No — absence-scoring metric).
- **Absence recording:** lets users record *other* staff absent for the day; you pick **which leave type** is used and which user level can record across departments (currently disabled).

### Defaults — "Default working schedule"
Company default working week grid: per weekday **Days** (- / ½ / 1) and **Hours**, plus a per-day "show/label as". Default here is Mon–Fri = 1 day / 8 h, Sat–Sun = off. Overridable per user (see §4).

### Security
- **Force MFA?** (Yes/No) — company-wide emailed-code enforcement. (Individuals can additionally use an **authenticator app** — per-user MFA = None | Email | Authenticator, set in My Details, §9.)
- **Extended password policy** (optional): min 12 chars + upper/lower/number/special (standard = min 8).
- **Lockout policy** (optional): 5 failed logins → 30-minute lockout.

### Branding
- Company logo (upload, max 100 kb).
- Colour system: predefined templates + pickers for Background, Primary, Secondary, Menu, Warning, Error, Success, **Free day, Restricted day, Non-working day**.

### Active Directory — present but **disabled** on this plan.

### Single Sign On — SAML.
Provider: No provider | Auth0 | Azure | Google | Okta | OneLogin | Other. Activate SSO → generates an Integration GUID → upload IdP XML metadata. "Force SSO" locks all logins to the IdP; "Revoke SSO" to undo.

### API Access — REST API to account data. One-click "Enable API Access".

### Webhooks — outbound event push.
Status (Inactive/Active); Webhook administrator; Header key name + Secret (optional); Webhook address (URL); Security method (Standard…); Create webhook; **Send test event** with output panel.

### Staff hub (inc. Documents) **[NEW add-on]**
Not enabled. Enabling upgrades the role to "Super User with Staff Hub" and adds **document storage/management** for staff.

**[v3]** Worth deciding which of these OU7 v3 surfaces: Bradford Factor, absence-recording-on-behalf, document hub, webhooks/API, and how branding tokens map onto OU7's design-token system.

---

## 3. People & structure

### Manage Staff (`/administration/staff`)
- Filters: Type (Company | Department | Tag | My staff | Region) · Last name · Status (Active | Deactivated | Both) · Sort. 73 staff; per-page 5/10/25/50/100/ALL. Add/Import staff, Export data.
- List columns: name, **User type**, Department, **Approver(s)** (shown as "X – leave & overtime"), This-year / Next-year available to book.
- Row actions: **Notes · Leave · Overtime · Restrictions · Edit · Delete**.

### Import Staff (`/administration/staff/add/import`)
Spreadsheet bulk upload.

### Departments (`/administration/departments`)
13 departments. Per department: **Min. staff level** (minimum present) and **Max. leave level** (max leave requests/day). When a level is hit, further requests are refused with a message. Scope which leave types count via each leave type's "affect department levels?" flag.

### Regions (`/administration/regions`)
**Only one region exists: "United Arab Emirates."** Regions drive the public/bank-holiday sets. **[v3 — important]** WhosOff is *not* modelling KSA / Beirut / Remote as regions; the whole company sits in one UAE region and per-market weekends are handled per-user in the working schedule (§4). This diverges from OU7's four-market region model — confirm the intended target before migrating.

### Tags / Groups (`/administration/tags`)
Arbitrary cross-cutting staff groups (e.g. "all approvers") for the wall chart and reporting. None defined yet.

---

## 4. Edit Staff Record (per user)

Sub-tabs: Personal details · Profile · Tags/Groups · Leave allowances · Working times · Download/Delete · Change allowance type. Plus per-user Notes / Leave / Overtime / Restrictions.

| Area | Fields / options |
|---|---|
| Personal details | Staff code; Title; First/Middle/Last name; Tel (work/mobile); Employment started/ended (info only); profile picture (max 500 kb) |
| Account setup | Status (Active/Deactivated); **User type** (see roles below); Username/Email; Password (+ generate); Emails format (None | Text | HTML) |
| Department / Region | Department; Region |
| Approvers & Notifiers | Up to **3** slots: Approver, 2nd, 3rd — each with **permission** = Approve (leave & overtime / leave only / overtime only) **or** Notify (leave & overtime / leave only / overtime only). "Notify" = informed but not an approver |
| Leave allowances | Per-year rows: Opening, Remaining, Carryover opening, Carryover remaining, **inc. Lieu**, Carryover expires, Available to book. Hand-edited. "Use allowance calculator." |
| Working times | Effective-dated rows (Start/End) of the working week (per-day full/half/off + label). This UAE staff = **Sun–Thu** (Fri/Sat off). |
| Change allowance type | Switch **Days ↔ Hours** — destructive (wipes leave/overtime/all-year allowances; re-enter opening/remaining); requires data download first |
| Restrictions | Clash-prevention pairs: pick another staff member + "add reverse entry?" → the two can't be off at the same time |

**Role levels (User type):** Staff · Approver · Approver with Add Leave/Overtime · Approver with Add Leave/Overtime & Edit/Cancel Leave · Super User. (+ "Super User with Staff Hub" once that module is on.)

**[v3]** Two structural notes for OU7: (1) WhosOff **hand-stores** opening + remaining balances per year, whereas OU7 computes them — our migration must derive opening/remaining/carryover/lieu from these stored figures. (2) Weekends live in the **per-user working schedule**, not the region — so a UAE Sun–Thu vs a Remote Mon–Fri person differ only by their working-times rows.

---

## 5. Leave configuration

### Leave Types (`/administration/leave-types`)
13 types (Bereavement, Compensation, Maternity, National Holiday, Out Of Office, Paternity, Sick Leave Not/Working, Travel *[deactivated]*, Un-Paid, Vacation, Wedding). List shows Code, Requires approval, Allowance time, Min length, Consecutive time, Consecutive requests, Colour.

**Per-type Edit** (sub-tabs Details · Restrictions & Levels · Email Settings):

| Group | Options |
|---|---|
| Details | Name; Code; **Colour** (wall-chart); Status; Confirmation message on submit |
| Permissions | Requires approval?; **Deduct allowance time?** (does it consume allowance); Hours-only?; Minimum length (days); Max consecutive days; Allow consecutive bookings?; Notes required?; Notes visible to / Available to / Seen by (All staff | Approvers & Super Users | Super users only) |
| Restrictions & Levels | **Notice period** (± days; negative = book in the past allowed); **Cancellation period** (days); Does this leave affect department staffing levels? |
| Email Settings | Email on request / approval-decline / cancellation → None | Staff, approver & notifier | Staff only | Staff & approver | Approver only. Plus custom staff/approver messages + document URLs |

### Leave Rules (`/administration/bulk/rules`)
Per-leave-type **annual cap**: Max working time per year as **Days + Hours**. Set by leave type, by staff-per-type, or per staff member; per-staff **overrides** shown inline (e.g. "1 × staff personal rules"). Add / Edit / View staff / Clear rule.

### Free / Restricted Days (`/administration/free-restricted-days`)
Holidays / blocked days. **[v3 — gap]** Currently **none configured** on this account. Type = **Free** (company day off) or **Restricted** (leave can't be booked). Apply to all / selected departments / selected regions; single or multi-day; description. **Import public holidays** by country (full country list) into chosen departments/regions.

### Alerts (`/administration/company-alerts`)
Login-banner messages. Type = Company | Department(s) | Tag(s) | Region(s) — when scoped, the specific departments/tags/regions are chosen on dedicated sub-tabs; plus date range and message body. Shown to scoped users on sign-in.

### Calendar Feeds (`/administration/calendar-feeds`, also under Tools)
Generates subscribable iCal feed URLs (Outlook/Google/Apple). Per feed: Title; Type (Company | Department | Tag | Staff | Region); Duration (1–12 months rolling); Link visible to (All staff | Approvers & super users | Super users only); Leave to show (per leave-type setup | all leave | a specific type); Time zone.

---

## 6. Bulk tools (`/administration/bulk/*`)

- **Book staff leave** — book for a staff member / one or more departments / whole company (e.g. closures). "Manage bulk bookings" to review/cancel.
- **Balance administration** — prep this/next year balances by copying previous year or a fixed value; per department. **Only sets staff who don't already have an allowance for that year** (won't overwrite existing balances).
- **Leave rules** — see §5.
- **Set approvers/notifiers** — bulk reassign the 1st/2nd/3rd approver slot (with permission) for filtered staff.
- **Set departments** / **Set regions** — bulk move filtered staff.
- **Set / send emails** — bulk set email format, or send welcome/onboarding emails, to a department or the whole company.
- **Yearly carryover** — year-end roll of unused allowance using the company carryover caps + expiry.

---

## 7. Reports (`/reporting`)

- **Leave & Work:** WhosOff (by type/date/scope) · WhosOff summary (yearly, effect on allowances) · WhosOff cancelled & declined · Working schedule.
- **Overtime:** Overtime report **[out of scope]**.
- **Staff:** View all staff · Staff directory (email + phone) · Staff restrictions · **Allowance log** (line-by-line balance amendments per year).
- **Breakdown:** Leave overview · Leave by allowance period · Allowances across periods · Yearly calendar.
- **Company:** **Account logins** (recent logins) · **Company log** (transactional change/audit trail).

---

## 8. The planner & dashboards

- **WhosOff wall chart** (`/whosoff`): staff × days-of-month grid; leave drawn as coloured blocks with 2-letter codes; non-working/weekend days greyed with ×; today highlighted. Filters: Year, Month, Leave type, Show free/restricted days, Show only WhosOff, Type (Company/Dept/Tag/My staff/Region), name, sort; Highlight-WFH. Export / Print.
- **Dashboard** (`/`): configurable widgets — "WhosOff today", "Allowances this year" (donut + Opening / Pending / Available breakdown), inline Request-leave form. "Edit My Dashboard."
- **My Staff** (`/my-staff`): an approver's direct reports with balances + pending leave/overtime counts; Staff / Leave-breakdown tabs.
- **Approval inbox** (`/administration/pending-leave`, and `…/pending-overtime`): the approve/decline queue. Scope My staff | All staff; sort by requested/start date. Columns: Requested, Staff member, Approver(s), From, Duration, **Free / Working / Allowance** day split, Leave type, approve/decline. This is the core approver workflow OU7 mirrors with request→approve→cancel.

---

## 9. Per-user self-service (`/my-details`)

Overview (my approver(s), allowances) · Personal details · Staff profile (Account settings: username/email, password, **Default view** + **Default sorting**, profile pic, email format, **Google Social Sign-On**, **per-user MFA: None | Email | Authenticator**) · My dashboard (**up to 6 widget slots**; **Daily email roundup** with preferred GMT time).

---

## 10. Out of scope / vendor-only (note, don't build)

- **Overtime** end-to-end (types with Lieu/TOIL accrual, submit/record/approve, reports). OU7 explicitly excludes overtime.
- **Billing & payments / Invoices / "Refer and earn"** — SaaS-vendor concerns; irrelevant to a self-hosted OU7.

---

## 11. v3 shortlist (the decisions this map surfaces)

1. **Region vs working-schedule weekends.** WhosOff runs one UAE region and varies weekends per user via working-times rows. Decide whether OU7 keeps its four-market region model or follows WhosOff's per-user pattern for the migration.
2. **Balances: stored vs computed.** WhosOff hand-stores opening/remaining/carryover/lieu per year. Map these onto OU7's computed engine for the cut-over (especially carryover + lieu).
3. **Holidays are empty in WhosOff.** OU7 must seed UAE (and any other market) public holidays itself — there's nothing to import from this tenant. Consider OU7's own "import public holidays by country."
4. **Coverage controls.** Department Min-staff / Max-leave-per-day levels + per-leave-type "affect levels" + staff-vs-staff Restrictions. Confirm which of these OU7 v3 implements.
5. **Leave-type richness.** Notice period (incl. negative/past booking), cancellation period, consecutive-days caps, per-type email matrix, "deduct allowance?", hours-only types — a checklist to confirm against OU7's leave-type config.
6. **Approval routing depth.** Up to 3 approver/notifier slots with approve-vs-notify, leave/overtime-scoped permissions.
7. **Identity & security.** SSO (SAML, multiple IdPs), per-user MFA incl. authenticator app, Google social sign-on, extended-password + lockout policies — compare against OU7's Google-Workspace-SSO-only stance.
8. **Integrations OU7 may want:** iCal calendar feeds, webhooks, REST API, Staff-hub document storage.
9. **Self-service & polish:** configurable dashboard widgets, daily email roundup, default view/sorting per user (aligns with the locked v2 customizable-widgets decision).
