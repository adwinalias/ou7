# OU7 v2 — Add-on PRD (UX, performance & readiness)

**Status:** Draft v2.1 for review · **Date:** 18 June 2026 · **Updated:** 23 June 2026 (walkthrough findings folded in; awaiting sign-off)
**Owner:** Adwin Alias (Transformation) · **Sponsor:** HR (Interesting Times DMCC)
**Relationship to v1:** This is an **add-on** to `WhosOff-Replacement-PRD.md`. v1 is feature-complete on `main` (all of Epics 1–16). v2 does not add a new domain; it is a **quality pass — UX, accessibility, performance and production-readiness — before go-live**, driven by a live walkthrough of the running app plus an external review. All v1 guardrails are unchanged.

This PRD is execution-ready: it extends existing epics where possible and adds new ones (17–22) in the same format as `docs/EPICS.md` (MoSCoW priority, AC = acceptance criteria). Audit finding IDs (H1, M2, R1, …) refer to `docs/V2-UX-AUDIT.md`.

---

## 1. Goals & non-goals

**Goals**
- Make OU7 fully usable on a phone (it currently is not).
- Turn the dashboard into a glanceable, role-aware, customizable home.
- Meet the design system's stated WCAG AA bar in practice, not just on paper.
- Hit defined performance targets and add the missing production-readiness pieces (error handling, query efficiency, test coverage, CSP).
- Fix the clarity and consistency issues found in the audit.

**Non-goals**
- No new leave-domain logic (the `core/allowance` engine and workflow are unchanged).
- No AI/ML at runtime; no two-way calendar sync; no UI-framework swap; overtime stays out of scope.
- Not a rebrand — the "17"-derived design system and tokens stay.

---

## 2. Locked decisions

| # | Decision |
|---|---|
| 1 | **Scope = whole app** (Dashboard, Wall chart, My leave, Request, Approvals, Admin). |
| 2 | **Customizable dashboard widgets** — default layout + add / remove / reorder; role-gated tiles. |
| 3 | **Team visibility = company-wide by default, configurable** — HR can hide company-wide visibility and restrict members to their own department(s); enforced server-side. |
| 4 | **Mobile nav = bottom tab bar** (More entry for Approvals + Admin by role); hit targets ≥40px. |
| 5 | **Team Calendar = company-wide, type-abstracted.** "Wall chart" is renamed **Team Calendar**; it stays company-wide (decision #3) but every pending/approved entry displays only as one of four categories — **Out · Sick (non-working) · Sick (WFH) · National Holiday** — never the specific personal type. **HR sees the real type everywhere (incl. the calendar)**; the owner and approver see it in their own contexts. (DC1, DC2.) |
| 6 | **Manual balance changes go through a *typed* adjustment ledger** (no direct field edits); each entry picks the bucket it credits (e.g. public-holiday vs vacation days). **Multi-year storage is in scope** — real year-rollover storage + per-year visibility, via an ADR. (DC3, DC4.) |

**Walkthrough decisions — resolved 2026-06-23 (Eddy).** The four open items from the 23 June walkthrough are now decided and folded into the epics below (detail + the three-category mapping in `V2-UX-AUDIT.md`):
- **DC1 → keep company-wide; abstract the type.** Decision #3 unchanged; calendar surfaces show the three categories above (Epics 19.1, 18.2, 19.7).
- **DC2 → "Team Calendar."** (Epic 17.5.)
- **DC3 → adjustment-ledger-only, typed.** (Epic 24.3.)
- **DC4 → build multi-year storage.** (Epic 24, confirmed P1.)

Already in the v1 backlog (do not re-spec — extend if needed): per-leave-type annual caps (Epic 3.3), conditional note/attachment rules incl. Bereavement document (Epic 3.2), iCal/ICS calendar feeds (Epic 13).

---

## 3. Build order (phasing)

The wall chart is the *hardest* single screen (perf + accessibility + DB all land on it) but not the first to build. Ordered by user-visible value × reach × dependency:

- **Phase A — Responsive shell.** Epic 17. Foundational; every other screen rebuilds onto it.
- **Phase B — Dashboard v2 + consistency + accessibility.** Epics 18, 19, 20 — the front door and the cross-cutting correctness, much of which rides along with A and B.
- **Phase C — Performance & readiness.** Epics 21, 22 — including the wall-chart deep rebuild (virtualize + ARIA grid + single joined query), best done against realistic multi-person data.
- **Phase D — Multi-year & typed adjustments.** Epic 24 — write its ADR first (data-model change), then build; not a blocker for A–C.
- **Throughout:** the new Definition-of-Done gates (§4) apply to every story. The 2026-06-23 walkthrough deltas (branding quick wins 17.5, the Admin two-mode console 19.3, side-peek Request 18.7) ride along with their parent phases.

---

## Epic 17 — Responsive App Shell & Bottom Tab Bar · P1

**Goal:** The app is fully usable from 360px to 1920px; the sidebar no longer dominates small screens.
**Extends:** Epic 1 (App shell), Epic 15 (Design System). **Resolves:** H1, M4, cross-screen.

- **17.1 (Must) Bottom tab bar below 640px.** Replace the fixed sidebar with a bottom tab bar (My Dashboard / Team Calendar / My leave / Request) plus a role-aware **More** entry (Approvals, Admin).
  - AC: at ≤640px no persistent sidebar renders; tab bar is fixed, role-aware, current-tab indicated; targets ≥40px; works in both themes.
- **17.2 (Must) Responsive reflow on every screen.** Sidebar (desktop) ↔ tab bar (mobile); content reflows two-column → one-column ≤640px.
  - AC: Dashboard, Wall chart, My leave, Request, Approvals, Admin verified at 360 / 640 / 1024 / 1920; no horizontal overflow except the wall-chart grid's intended scroll.
- **17.3 (Must) Centred app container.** Cap main content to ~1280px, centred, with the design system's page padding.
  - AC: on a 1920px screen content is centred with no full-bleed stretch; padding matches DESIGN-SYSTEM §8.
- **17.4 (Should) Active-nav indicator bar.** Active item uses the green indicator bar, not a filled block; `aria-current="page"` set. (Resolves M3.)
  - AC: matches DESIGN-SYSTEM §5; `aria-current` present in the accessibility tree.
- **17.5 (Must) Branding & nav labels.** Enlarge the `OU7` wordmark (~2×, more header presence); show the org name as **"Interesting Times"** (drop "DMCC"); rename **"Dashboard" → "My Dashboard"** and **"Wall chart" → "Team Calendar"**, applied consistently across nav, headings, tab bar, routes and copy. (Resolves G1, G2, G4; DC2.)
  - AC: wordmark visibly larger in both themes and on mobile; no "DMCC" in the UI; nav, tab bar, page headings and breadcrumbs all read "My Dashboard" and "Team Calendar"; single accessible logo node (ties to L2).

---

## Epic 18 — Dashboard v2: Customizable Widget Grid · P1

**Goal:** A glanceable, role-aware home the user can arrange. (Decision #2.)
**Extends:** Epic 8 (Dashboard). **Resolves:** H2, H3, H4, M5.

- **18.1 (Must) Widget grid with persisted layout.** Default arrangement; add / remove / reorder; layout persisted per user. Tiles snap to a **consistent unit/module size** so the grid reads as even modules (DB1).
  - AC: a user can add/remove/reorder tiles; layout survives reload; default layout applies to new users; keyboard-operable; tiles align to a consistent module grid.
- **18.2 (Must) "Who's off" widget.** Today + next 7 days, region-aware, linking to the Team Calendar; honours the visibility config (decision #3) and the **four-category abstraction** (Out · Sick non-working · Sick WFH · National Holiday — never the specific personal type; decision #5). HR sees the real type.
  - AC: shows correct absentees for the viewer's permitted scope (company or department); non-HR viewers see only the category, not the personal leave type; HR sees the real type; respects weekends/holidays per region.
- **18.3 (Must) Role-aware "Pending approvals (N)" tile.** Shown to approvers/HR; deep-links to the queue.
  - AC: count matches the queue; hidden for non-approvers; links through.
- **18.4 (Must) Allowance widget with clear breakdown.** Reuse the My-leave labelled breakdown so the headline number and the footer can't contradict. Add a **"Carry over from last year"** line and group the figures visually: **(Opening + Carry-over) = total held · (Taken + Pending) = used/requested · (Remaining, Available) = headline** (AD9). Use the same component on the Admin allowance view. (Resolves H4, AD9.)
  - AC: the widget shows the grouped subtraction (Opening + Carry-over − Taken − Pending = Available) with carry-over surfaced; no standalone number that conflicts with the breakdown; the same breakdown renders in Admin and My leave.
- **18.5 (Should) "Next 7 days" + "Upcoming holidays/events" tiles** using the shared key (Epic 19). The "Next 7 days" tile carries its own **drawn-swatch legend** (like "Allowance this year"), not text such as "hatched = non-working" (DB2). (Resolves M2 on the dashboard.)
  - AC: each calendar surface uses the shared legend; the legend uses drawn swatches (incl. a holiday swatch), not explanatory text; pending renders per the cell spec.
- **18.6 (Could) Alerts widget.** Deterministic rule-based nudges (carry-over expiring, request waiting on you, 0 days booked).
  - AC: rules live in `core/`; no model/LLM call; each alert links to the relevant screen.
- **18.7 (Should) Request leave as a side-peek.** Demote the Request-leave card and reclaim the column; the action opens a **slide-over / side-peek panel** (not a full-page navigation) to capture the request inline. (Resolves M5, DB3.)
  - AC: a persistent "Request leave" action exists; clicking it opens a slide-over panel over the current screen; the panel is keyboard-operable and focus-trapped (ties to 20.3); the dashboard no longer spends a full column on a single button. *(Server-side validation/authz unchanged — the side-peek is a presentation of the existing Request flow.)*

---

## Epic 19 — UI Consistency & Polish · P1

**Goal:** Remove the small inconsistencies that read as unfinished.
**Extends:** Epic 15 (Design System), Epic 5 (Request), Epic 9 (Admin). **Resolves:** M1, M2, AD1, AD2, R1, R2, ML1, ML2, L1–L3, W1.

- **19.1 (Must) Shared category + status key component.** One component reused on every calendar surface (Team Calendar, dashboard tiles). On shared/company-wide surfaces the key shows the **four abstracted categories** — Out · Sick (non-working) · Sick (WFH) · National Holiday — plus weekend (decision #5); detailed per-type display stays in the owner/approver/HR contexts (HR sees the real type everywhere).
  - AC: changing the key in one place updates all surfaces; shared surfaces show the four categories, not the nine types; HR's view shows the real type; pending = grey cell + coloured left bar per DESIGN-SYSTEM §2.
- **19.2 (Must) Icon theme toggle.** Replace the "LightDark" run-together text control with a single **icon toggle** (e.g. sun/moon) that clearly shows the active mode; default to OS preference on first load. (Resolves M1, G3.)
  - AC: active mode visually unambiguous; control is icon-based with an accessible label; persists; first visit follows `prefers-color-scheme`.
- **19.3 (Must) Admin rebuilt as a two-mode, single-page console.** Replace the flat list of click-into subsections with one Admin surface that toggles (segments/tabs, **not** navigation buttons) between **System-level settings** and **Employee-level settings**; everything lives on one page with no nested click-throughs. Remove internal jargon ("EPIC 9") and the leaked caption. (Resolves AD1, AD2, AD4.)
  - **System-level settings (AD5):** leave types; per-region ("base") config — annual days, carry-over cap, carry-over expiry; add a region/base; regional calendars; restricted days — all inline.
  - **Employee-level settings (AD6):** employee list with activate/deactivate; selecting a person opens their record (email, first/last name, region, **department** (AD7), approver level 1/2/…) plus that person's allowance management, pending queue, and add-leave-on-behalf — all in the one view.
  - **Change-safety (AD8):** before changing region/rule/department, either confirm ("are you sure?") or use a save-at-end model that shows a **diff** ("changing X → Y," N settings changing) before applying.
  - AC: Admin is a single page with a System ⇄ Employee mode switch and no navigate-away sub-buttons; system settings are editable inline; an employee record shows and edits the fields above incl. department, with allowance/queue/on-behalf in place; sensitive edits (region/rule/department) require explicit confirmation or a reviewed save-diff; counts shown where relevant (e.g. "Pending queue (N)"); no developer/internal references in UI copy. *(All actions re-authorize server-side per the guardrail; the engine logic is unchanged.)*
- **19.4 (Must) Request form: default, conditional doc, labels & live impact.** Default to "Select a leave type…" (empty, force an explicit pick); add the HR force-pick flag; make the **supporting-document field conditional** — drive it off the existing `attachmentThresholdDays` config (seeded: *Sick Leave Not Working* = 2), so the field appears only when the request span exceeds the type's threshold, not for a single full-day or half-day (R4); relabel the half-day options **"Morning (first half)" / "Afternoon (second half)"** keeping AM/PM in brackets (R5); add a live allowance-impact panel and **redesign "Check details"** as grouped, spaced rows — *Working days · Weekend/holiday (0) · Available now · Available after request → Submit* (R6). (Resolves R1, R2, R4, R5, R6.)
  - AC: no type pre-selected on load; supporting-document field shows only under the multi-day/long condition; half-day labels read "Morning (first half)" / "Afternoon (second half) (AM/PM)"; impact panel updates as type/dates change and matches `core/allowance`; the Check-details step shows the grouped working-days / weekend-holiday / available-now / available-after rows. *(Date validation and day-count maths were verified correct in the walkthrough — no engine change.)*
- **19.5 (Should) One filtering model app-wide.** Reconcile Wall chart and My leave filters (live vs explicit Apply). (Resolves W1.)
  - AC: both screens use the same model; state is preserved across navigation.
- **19.6 (Should) Copy & polish.** Clarify "Free/Working" labels (ML1); standardise the mono date picker (ML2); fix donut centring (L1); single logo node for a11y (L2); greeting + date on the dashboard (L3); rename Wall-chart "Name filter" → **"Search"** (W7); move the Wall-chart legend up into the caption row and drop the separate explanatory sentence (W8).
  - AC: each item verified in both themes.
- **19.7 (Must) Team Calendar: abstraction, controls & RBAC.** The calendar stays **company-wide** (decision #3; the configurable department-restriction remains available to HR). Every pending/approved entry renders only as one of four categories — **Out · Sick (non-working) · Sick (WFH) · National Holiday** — never the specific personal type, enforced server-side so sensitive types never reach a non-HR client payload (W10, decision #5; ties to 22.4 taint). Mapping: SN→Sick (non-working), SW→Sick (WFH), H→National Holiday, all other types→Out. **HR receives the real type** (and sees it on the calendar); owner/approver see it in their own contexts. Remove the **"Filter by leave type"** control (W6); rename **"Name filter" → "Search"** (W7); move the legend into the caption row showing the three categories + weekend/holiday (W8). Gate **Export CSV** and **Print** to admin only (W9). Keep the praised month grid and grey-pending / solid-approved rendering unchanged.
  - AC: entries display only their category (verified: no specific leave type in the client payload for non-owner/non-HR viewers); the leave-type filter is gone; the name filter reads "Search"; the legend sits in the caption row with the three categories; CSV/Print hidden for non-admins; approved renders solid, pending grey + coloured bar.
- **19.8 (Should) My leave: approvers + density.** Add a **"My approvers"** widget showing the approval chain (Level 1, Level 2, …); reduce the allowance widget's footprint and place "My approvers" beside it. (Resolves ML4, ML5.)
  - AC: the approver chain is shown with levels in order; the two widgets sit side-by-side without the allowance panel dominating; reflows to one column ≤640px.

---

## Epic 20 — Accessibility to WCAG AA · P1

**Goal:** Meet the design system's stated AA bar in practice; enforce it in CI.
**Extends:** Epic 6 (Wall chart), Epic 5/9 (forms), Epic 15. **Resolves:** W3, L4, design-system §7.

- **20.1 (Must) Wall chart as a semantic ARIA grid.** Roles `grid`/`rowgroup`/`row`/`columnheader`/`rowheader`/`gridcell`; `aria-colcount`/`aria-rowcount` + cell `aria-colindex`/`aria-rowindex`; roving focus via `aria-activedescendant` (APG Grid pattern).
  - AC: fully keyboard-navigable (arrow keys move the active cell); screen-reader announces row/column context; day cells meet ≥40px touch targets.
- **20.2 (Must) Accessible forms.** Labels on every input; custom selects use `combobox`/`listbox`/`option`; validation via `aria-required`/`aria-invalid`/`aria-errormessage`; date picker per APG.
  - AC: each form field has a programmatic label; errors are announced; keyboard-only completion works.
- **20.3 (Must) Accessible modals.** `role="dialog"`/`alertdialog` + `aria-modal`; focus trapped while open; focus returned to the trigger on close.
  - AC: tab focus cannot leave an open modal; Escape closes; focus restored.
- **20.4 (Must) Landmarks, focus & status.** `navigation` landmark; visible green focus ring everywhere; status changes announced via `role="status"`/`aria-live`; status never by colour alone (colour + letter/label).
  - AC: every interactive element shows the focus ring; pills carry text/letter; `prefers-reduced-motion` honoured.
- **20.5 (Must) Enforce in CI.** Enable `eslint-plugin-jsx-a11y`; add an automated a11y checker (e.g. AccessLint) to the merge gate.
  - AC: a11y lint runs in CI and can fail the build; documented in the DoD.

---

## Epic 21 — Performance & Rendering · P1

**Goal:** Fast first load and navigation; defined, measured targets.
**Extends:** Epic 1, Epic 6, Epic 8, Epic 16. **Resolves:** perf workstream.

- **21.1 (Must) Middleware auth.** Add `middleware.ts` for the domain-restricted SSO gate so data-free routes stay statically rendered (session is currently checked in a layout, forcing dynamic rendering everywhere).
  - AC: `next build` shows data-free routes as static; protected routes still redirect unauthenticated users.
- **21.2 (Must) Stream the dashboard.** One `<Suspense>` boundary per widget with a skeleton fallback; shell + tab bar render instantly.
  - AC: shell paints before widget data; each widget shows a skeleton then streams in; no whole-page block on the slowest query.
- **21.3 (Must) Virtualise the wall chart.** Window the employees × days grid so only on-screen cells render; lazy-load off-screen content.
  - AC: with a realistic dataset (e.g. 100+ employees × a month) scroll stays smooth and initial render is bounded; pairs with 20.1's grid semantics.
- **21.4 (Must) Core Web Vitals targets in the DoD.** LCP ≤ 2.5s, INP/FID ≤ 100ms, low CLS; measured with Lighthouse, the Web Vitals extension, `useReportWebVitals`, and Unlighthouse across routes.
  - AC: targets documented in the DoD; Unlighthouse run recorded before go-live; regressions flagged.
- **21.5 (Should) CLS guards & bundle discipline.** Explicit dimensions on donut/avatar/logo; skeletons sized to match; `@next/bundle-analyzer` in the toolchain; prefer native `Intl`/light deps.
  - AC: no visible layout shift on dashboard load; bundle report available; no heavy date/util libs added.

---

## Epic 22 — App Readiness: Errors, Data, Security · P1

**Goal:** Graceful failure, efficient queries, and the production-checklist security items.
**Extends:** Epic 5, Epic 6, Epic 16. **Resolves:** error-handling, DB, security workstreams.

- **22.1 (Must) Error boundaries & pages.** `error.tsx` per route segment; `app/global-error.tsx` (own `<html>`/`<body>`); `not-found.tsx` + `notFound()` and `global-not-found.tsx`.
  - AC: a thrown error in one segment shows a localised fallback, not a blank app; 404s render the custom page.
- **22.2 (Must) Expected errors as values.** Form-validation/failed-request errors returned via `useActionState`, not thrown; event-handler/async errors handled with state.
  - AC: invalid form submissions show inline messages without crashing; no reliance on error boundaries for expected errors.
- **22.3 (Must) Wall-chart query without N+1.** Load the grid with Prisma `relationLoadStrategy: "join"` (or `include`/`in`), never a query per employee; bulk ops (`createMany`/`updateMany`) for batch work; single `PrismaClient` in `lib/db.ts` (already done).
  - AC: loading the wall chart issues a bounded number of queries regardless of employee count (verified via query logging).
- **22.4 (Must) Security checklist.** Authz inside every Server Action + server-only data-access layer (matches guardrail); taint sensitive data; add a Content Security Policy.
  - AC: a CSP is set; server actions re-verify authz; no sensitive data reaches the client payload.
- **22.5 (Must) Test coverage on hot paths.** Vitest for `core/allowance` + zod + sync components; Playwright for SSO, request → approve → cancel, wall chart, and async Server Components.
  - AC: the named flows have passing E2E tests in CI; allowance engine unit tests remain exhaustive.

---

## Epic 23 — New Capabilities (optional) · P2/P3

**Goal:** High-value additions, scheduled after the readiness work.

- **23.1 (Should) Month calendar view** beside the wall-chart grid (same data, casual glancing). *Extends Epic 6.*
- **23.2 (Could) ⌘K command palette** ("request leave," "jump to a person," "go to wall chart").
- **23.3 (Could) Small HR charts** (absence trend, allowance utilisation) in reports — on-brand, reduced-motion safe. *Extends Epic 12.*
- **23.4 (Could) Bulk approve / decline** in the approvals queue. *Extends Epic 5.*
- *(iCal/ICS feed is already Epic 13; per-type caps already Epic 3.3 — track there.)*

---

## Epic 24 — Multi-year Balances, Year Rollover & Typed Adjustments · P1

**Goal:** Make balances correct and legible across calendar years, and give HR a controlled, audited way to adjust them.
**Extends:** Epic 9 (Admin allowance), `core/allowance`. **Resolves:** AD10, AD11 (DC3, DC4 resolved 2026-06-23). **Caution:** this extends the data model and brushes the v2 non-goal "no change to the allowance engine's logic" — **write an ADR first** (the engine's existing pro-rata/carry-over rules stay locked; this adds year-scoped storage + typed adjustments around them).

- **24.1 (Must) Year-rollover model.** Define and document how balances roll **2026 → 2027** — how each year's opening, carry-over (cap 5, expiry 31 Mar), taken, and adjustments are stored and recomputed without mutating prior-year history. *(Deterministic, tested in `core/`; ADR required.)*
  - AC: rolling a year produces the next year's opening + carry-over per the locked policy; prior-year figures are immutable; covered by exhaustive `core/allowance` unit tests.
- **24.2 (Must) Per-year visibility in Admin.** On an employee's record, show the **year** in allowance management, show the **previous year alongside the current** without re-selecting, and drill from a year's balance into that year's leave records.
  - AC: HR can see current + prior year side-by-side and open the leave records behind any year's balance.
- **24.3 (Must) Typed adjustment ledger — the only manual path.** No direct editing of opening/pending/remaining. All manual changes are append-only adjustment-ledger entries, and each entry specifies **which bucket it credits/debits — e.g. public-holiday days vs vacation days** (DC3). Entries are audited and authz-checked.
  - AC: balances can only be changed via a ledger entry (no direct field edit anywhere); creating an entry requires choosing its type/bucket (incl. public-holiday vs vacation); every entry is in the audit log; derived balances recompute from the ledger via `core/allowance`.

---

## 4. Definition of Done — additions for v2

Every v2 story must additionally meet:
- Works at 360 / 640 / 1024 / 1920 px in **both** themes.
- WCAG AA: keyboard-operable, visible green focus ring, correct roles/labels, `prefers-reduced-motion` honoured; passes the CI a11y check.
- Meets the Core Web Vitals targets (LCP ≤ 2.5s, INP ≤ 100ms, low CLS); no new layout shift.
- Has the relevant error/empty/loading states.
- Uses tokens (no hard-coded hex); no new heavy dependency without justification.
- Existing gate still green: `typecheck && lint && test && build`, plus the new a11y check.

## 5. Out of scope (v2)

AI/ML at runtime; two-way calendar sync (ICS export only); a UI-framework swap; overtime/TOIL; any change to the allowance engine's logic.

## 6. Untested passes to complete during v2

The populated Approvals queue, Request with each leave type, the nine Admin sub-screens, and the Wall chart with realistic multi-person data — review each before its epic is marked done.
