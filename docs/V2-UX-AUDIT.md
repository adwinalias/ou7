# OU7 — v2 UI/UX Audit & Build Priority

Whole-app UI/UX review (Dashboard, Wall chart, My leave, Request, Approvals, Admin), reviewed live at desktop and 390px mobile, in both themes. Grounded in `docs/DESIGN-SYSTEM.md`. The palette and brand discipline are sound; the problems are hierarchy, clarity, density, and responsiveness.

Severity: **High** = hurts the core job or breaks on a real device · **Medium** = noticeable friction / off-contract · **Low** = polish.

---

## Locked v2 decisions

1. **Scope = whole app**, not just the dashboard.
2. **Customizable dashboard widgets** — users arrange their own tiles (default layout + add / remove / reorder). Widget set: My allowance, My next 7 days, Who's off, Pending approvals (role-gated), Upcoming holidays/events, Alerts (later).
3. **Team visibility = company-wide by default, configurable** — HR can hide company-wide visibility and restrict members to their own department(s). Needs a setting in Admin → Configuration, enforced server-side on the Wall chart and the "Who's off" widget.
4. **Mobile nav = bottom tab bar** (Dashboard / Wall chart / My leave / Request, with a More entry for Approvals + Admin by role); hit targets ≥40px.

---

## Suggested v2 build order

The earlier "wall chart is the #1 rebuild" framing was too narrow — it was the screen where the perf, accessibility, and DB concerns happened to intersect, which makes it the *hardest* single screen, not necessarily the *first*. Ordered by user-visible value × reach × dependency:

1. **Responsive app shell + bottom tab bar.** Foundational, affects every screen, and the app is effectively unusable on a phone today (the sidebar eats ~40% of the screen on all screens). Other screens should be rebuilt onto this shell, so it goes first.
2. **Dashboard rebuild.** The front door and the weakest UX: the customizable widget grid, "Who's off," role-aware pending-approvals tile, and the allowance-clarity fix. Highest visibility, high value.
3. **Cross-cutting correctness.** Error boundaries, accessibility enforcement, allowance clarity, theme toggle, the shared legend, and form validation — spread across screens; much of it can ride along with steps 1–2.
4. **Wall chart deep rebuild.** The largest single engineering effort (virtualization + semantic ARIA grid + single joined query). Important, but the perf/scale issues aren't biting at current headcount, and it's a contained project best done against realistic multi-person data — so it can follow the shell and dashboard rather than lead.

---

## 1. Dashboard

Today: a left sidebar, a top bar with a Light/Dark control, an `H1`, and three cards in one row — *Allowance this year* (donut + Taken/Pending/Available legend + "Opening 26 · Remaining 26"), *My next 7 days* (a T–W strip with "V" cells; weekend hatched), and *Request leave* (one line + button). Below them ~two-thirds of the page is empty.

### High

**H1 — Sidebar doesn't collapse on mobile.** At 390px the fixed ~220px sidebar eats ~40% of the screen; content is jammed into the rest. Violates the design system's reflow requirement (360→1920, two-column → one column ≤640px). *Fix:* bottom tab bar below 640px (decision #4); targets ≥40px.

**H2 — No team visibility ("who's off") on the dashboard.** It's entirely *me*-focused; you must leave for the Wall chart to answer "can I book Thursday?" *Fix:* a "Who's off / out this week" widget from the region-aware calendar engine.

**H3 — Dashboard isn't role-aware.** Approvers see the same three cards as everyone, with no pending-approvals count or shortcut. *Fix:* a role-gated "Pending approvals (N)" tile linking to the queue.

**H4 — Allowance numbers read as contradictory.** The donut centre says "20 available" while the footer says "Remaining 26," with no explanation that Pending 6 is the gap (Remaining 26 = Opening 26 − Taken 0; Available 20 = Remaining − Pending). *Fix:* show the subtraction or relabel; the My-leave table (below) already does this clearly — reuse it.

### Medium

**M1 — Theme control renders as "LightDark."** Two buttons flush together, no separator, no visible active state. *Fix:* a real segmented toggle with an unmistakable selected state; default to OS preference on first load.

**M2 — "Next 7 days" strip is under-explained and off-contract.** The legend only explains the hatch; "V" is never defined (it means pending Vacation), there's no type/status key, and pending cells render as a flat block rather than the spec's "grey cell + coloured left bar marking the type." *Fix:* add a compact type/status key and render pending per the cell spec so it matches the Wall chart.

**M3 — Active nav is a filled block, not the spec'd indicator bar.** The design system says active = a green indicator bar, not a filled pill. Also confirm `aria-current="page"`.

**M4 — Weak use of space / no max-width container.** Cards stretch full-width then leave ~two-thirds blank. *Fix:* centre a ~1280px container and fill the reclaimed space with the widgets from H2/H3.

**M5 — "Request leave" card wastes a column on one button.** *Fix:* demote to a header action or compact tile; reuse the space.

### Low

- **L1** Donut centre number overlaps the ring at some sizes — tighten centring.
- **L2** Two `OU7` logo nodes in the DOM — ensure only one is exposed to assistive tech with a meaningful label.
- **L3** No greeting/date anchor — a short greeting + today's date (mono) would orient the user.
- **L4** Re-verify the DoD gates on every new widget: visible green focus ring, keyboard order, `prefers-reduced-motion`, ≥40px touch targets.

---

## 2. The rest of the app

### Wall chart — strongest screen
Clear caption, a real legend (Vacation / Pending / Weekend), full controls (month nav, Group by, Leave type, Sort, Name filter, Export CSV, Print), and on mobile the grid horizontal-scrolls with a sticky name column (per spec).
- **W1 (Med)** Filters need an explicit **Apply** (so does My leave) — pick one filtering model app-wide; live-filter is friendlier.
- **W2 (Low)** Month granularity only; no week/quarter/"jump to today."
- **W3 (Low)** Day cells ~30px — confirm they never drop below the ≥40px touch target and that the grid carries calendar-grid ARIA.
- **W4 (Med)** "Group by Company" is where the company-vs-department visibility control (decision #3) lives and must be enforced server-side.
- Only one seeded employee exists, so real density (dozens of rows) is untested.

### My leave — clean, on-brand
The allowance table here (Opening / Remaining / Pending / Available as labelled columns) is the clarity the dashboard donut lacks — reconcile them (H4). History table is well-formed: mono headers, grey PENDING pill (correct), red Cancel + secondary Remind, totals, pagination.
- **ML1 (Low)** "Free"/"Working" column labels are ambiguous — reword or add header help.
- **ML2 (Low)** Native `dd/mm/yyyy` inputs vs the design system's mono date picker — standardise.
- **ML3 (Med)** Define a mobile reflow (card list) so the multi-column table doesn't clip.

### Request — good two-step form, one bad default
Clean flow (Details → Check details → submit); the Duration segmented control has a clear selected state (the theme toggle should copy it); a conditional required "Supporting document URL" appears for the right types.
- **R1 (Med)** Default leave type is **Bereavement** — sensitive, and it forces a required document on load. Default to "Select a leave type…" (or Vacation); add an HR toggle to force explicit selection.
- **R2 (Med)** Allowance impact is gated behind "Check details"; add a **live impact panel** ("uses 6 working days, leaves 14") in the empty right column.
- **R3 (Low)** "Supporting document URL" expects a pasted link (no upload) — pragmatic for a standalone app, but a known friction.

### Approvals — good empty state, rest untested
Editorial empty state ("Nothing waiting on you.") is on-spec.
- **A1 (Low)** Empty state lacks a next action (e.g. "View the wall chart").
- **A2 (Med)** No pending items on this account, so the populated queue (approve/decline, balance impact, bulk actions, routing) is untested — review with seeded requests.

### Admin — weakest after the dashboard; needs IA
- **AD1 (High)** A flat row of identical ghost buttons (Employees, Allowance management, Pending queue, Add leave on behalf, Configuration, HR logs, Audit log, Regional calendars, Restricted days) — no grouping, icons, descriptions, or hierarchy. *Fix:* group into labelled sections (People · Policy & calendars · Logs & exports) as described cards with counts (e.g. "Pending queue (N)").
- **AD2 (Med)** The caption leaks internal jargon — "…Notion export. HR-only. See EPIC 9." Replace with plain user-facing copy.
- **AD3 (Med)** The nine sub-screens (the bulk of admin) weren't opened individually — each needs its own pass.

### Cross-screen patterns
- The fixed sidebar never collapses on any screen — the bottom tab bar (decision #4) fixes this globally.
- Pages aren't centred / max-width capped, so big screens show empty gutters — centre a ~1280px container and increase density.
- Legends are inconsistent (Wall chart has one; the dashboard strip doesn't) — build one shared leave-type/status key component and reuse it everywhere.
- Selected-state quality is inconsistent (Request duration control good, theme toggle bad) — standardise.

---

## Prioritized fix list

1. Responsive shell + bottom tab bar (H1, cross-screen).
2. "Who's off" widget (H2) and role-aware "Pending approvals" tile (H3).
3. Allowance clarity, reconciled dashboard ↔ My leave (H4).
4. Rebuild the dashboard as a customizable widget grid; centre the container; demote the Request-leave card (M4/M5, decision #2).
5. Shared type/status key; render pending per the cell spec (M2).
6. Segmented theme toggle with active state, default to OS (M1); align active-nav to the indicator bar (M3).
7. Admin IA pass — grouped cards, counts, plain copy (AD1/AD2).
8. Request form: fix default + force-pick option; live impact panel (R1/R2).
9. Polish: donut centring, single logo, greeting + date; re-run a11y/keyboard/motion/touch gates (L1–L4).

Untested passes still owed: the populated Approvals queue, Request with each leave type, the nine Admin sub-screens, and the Wall chart with realistic multi-person data.

---

## Walkthrough review — 2026-06-23 (Eddy, recorded)

New findings from Eddy's recorded screen+voice walkthrough of the running app. **Source note:** the supplied recording captured only the presenter's camera (the screen-share track was not in the file), so these are grounded in the full voice transcript (`Meeting with Adwin Alias.docx`) mapped onto the screens already documented above — not on new screenshots. Each finding is tagged **[confirms / extends / changes / new]** against the existing IDs and the locked decisions, so the PRD can reference them.

Severity uses the same scale (High / Medium / Low).

### Decisions — resolved 2026-06-23 (Eddy)
- **DC1 — RESOLVED: keep the calendar company-wide, but abstract the leave type.** Locked decision #3 stands (company-wide by default, configurable). Instead of revealing the specific type, the Team Calendar and the "Who's off" widget display each pending/approved entry as **one of three categories only**, protecting sensitive types from being broadcast company-wide. (See W5 + new W10.)
- **DC2 — RESOLVED: rename "Wall chart" → "Team Calendar."** (See G4, 17.5.)
- **DC3 — RESOLVED: adjustment ledger only (no direct edits), and the ledger entry must be *typed*.** Manual balance changes flow exclusively through the append-only adjustment ledger; when creating an entry HR picks **which bucket it credits — e.g. public-holiday days vs vacation days**. (See AD10, 24.3.)
- **DC4 — RESOLVED: build real multi-year storage.** Eddy: "multi-year storage will need to be built in for this app to last the test of time." Epic 24 is confirmed (P1), incl. the year-rollover model + per-year visibility; needs an ADR since it touches the data model. (See AD11, Epic 24.)

#### The Team-Calendar display categories (DC1, refined 2026-06-23)
Every pending/approved entry on shared calendar surfaces shows as one of **four** categories:
1. **Out** — Vacation, Bereavement, Maternity, Paternity, Wedding Leave, Out Of Office (all the personal away-from-work types).
2. **Sick — non-working** — maps to the seeded *Sick Leave Not Working* (SN).
3. **Sick — WFH** — maps to the seeded *Sick Leave Working* (SW).
4. **National Holiday** — kept as its own labelled category (not folded into "Out").

The nine seeded types cover this with no new type required. The two sick states keep their own colours (SN red, SW orange), National Holiday keeps its colour (H, #5C3D2E), and everything in "Out" shows under one shared colour. **Confirmed:** the abstraction applies to the *shared* surfaces (Team Calendar, Who's-off widget); **HR sees the specific leave type everywhere, including on the calendar**; the owner sees their own type (My leave) and the approver sees it in the queue (Approvals). Only non-privileged colleagues see the abstracted categories.

### Global / shell
- **G1 (High) — App wordmark too small.** The `OU7` wordmark in the header should be roughly **2× larger** / occupy noticeably more space. *[new]*
- **G2 (Low) — Drop "DMCC" from the org name.** Show **"Interesting Times,"** not "Interesting Times DMCC." *[new]*
- **G3 (Med) — Theme control should be an *icon* toggle.** Replace the "Light/Dark" text control with a single icon toggle (e.g. sun/moon). *[changes M1 — M1's segmented-toggle direction becomes an icon toggle; keep "default to OS on first load."]*
- **G4 (Med) — Nav labels.** Rename **"Dashboard" → "My Dashboard"**; rename **"Wall chart" → "Team Calendar"** (DC2, resolved). "My leave," "Request," "Approvals," "Administration" are all clear — leave them. *[new]*

### Dashboard ("My Dashboard")
- **DB1 (Med) — Consistent widget module.** Customizable widgets should snap to a **consistent unit size** so the grid reads as even modules. *[extends 18.1, confirms decision #2]*
- **DB2 (Med) — "My next 7 days" needs a drawn legend.** Give it a legend like "Allowance this year," using **drawn swatches** (e.g. a holiday swatch) rather than text such as "hatched = non-working." *[extends M2 → the shared key (19.1) should be swatch-based, not text]*
- **DB3 (Med) — "Request leave" opens a side-peek, not a page.** Clicking Request leave should open a **slide-over / side-peek panel** to fill in details, instead of navigating to the full Request page. *[extends/changes M5 & 18.7 — demoting the card is right, but the action is a side-peek]*

### Request leave
- **R1 confirmed** — empty leave-type default + force an explicit pick. *[confirms R1 / 19.4]*
- Multi-day date validation and the day calculation were tested live and judged **correct** — no change. *[confirms]*
- **R4 (Med) — Conditional supporting document.** For Sick leave, the supporting-document field should appear **only for multi-day / longer-than-expected requests**, not for a single full-day or half-day. *[extends 19.4 / 3.2]*
- **R5 (Low) — Relabel AM/PM.** Use **"Morning (first half)"** and **"Afternoon (second half)"**, keeping "AM"/"PM" in brackets. *[new]*
- **R6 (Med) — Redesign "Check details."** It's hard to read today. Visualize it as grouped, spaced rows: **Working days · Weekend/holiday (0) · Available now · Available after request → Submit request.** Pairs with the live-impact ask. *[extends R2]*

### Team Calendar (was "Wall chart" — renamed per DC2)
- **The month grid is praised** ("perfect, very well done"); pending-vs-approved is clear. Confirms the spec that **approved = solid colour**. *[confirms]*
- **W5 (resolved) — Scope stays company-wide.** DC1 resolved to *keep* company-wide (decision #3 unchanged); the privacy concern is handled by the three-category abstraction (W10), not by defaulting to department. The configurable department-restriction in decision #3 remains available to HR. *[no change to decision #3]*
- **W6 (Low) — Remove "Filter by leave type."** Not needed on the Team Calendar. *[new]*
- **W7 (Low) — Rename "Name filter" → "Search."** *[new]*
- **W8 (Low) — Move the legend up to the caption row.** Put the legend where the caption sits and drop the separate explanatory sentence. The legend now shows the three categories (W10) + weekend/holiday. *[extends 19.1 / W-legend]*
- **W9 (Med) — Gate Export CSV + Print to admin.** Hide both for normal users; show only to administration. *[new — RBAC on calendar controls]*
- **W10 (High) — Abstract entries into four categories.** On the company-wide Team Calendar (and the Who's-off widget), display each pending/approved entry only as **Out · Sick (non-working) · Sick (WFH) · National Holiday** — never the specific personal type — so sensitive types (Bereavement, Maternity, Sick) aren't broadcast. HR sees the real type; the owner/approver see it in their own contexts. Mapping is fixed (see the category note above). *[new — DC1 resolution]*

### My leave
- **ML4 (Med) — Show my approvers.** Surface the approver chain on My leave — **Approval level 1, level 2, …** *[new]*
- **ML5 (Low) — Tighten the allowance widget.** It's too spread out; reduce its footprint and place the new "My approvers" widget beside it (to its left). *[extends ML / density]*
- History table judged good — no change. *[confirms]*

### Administration (the priority rework)
Today's flat list of click-into subsections is "extremely hard to use." Replace it with a **single-page console split into two modes**.
- **AD4 (High) — Two-mode, single-page console.** Toggle between **System-level settings** and **Employee-level settings** (segments/tabs, *not* buttons that navigate away); everything lives on one page with no nested click-throughs. *[supersedes the 19.3 grouping — reframe People · Policy · Logs into this two-mode model]*
- **AD5 (High) — System-level settings (one page):** leave types; per-region ("base") config — **annual days, carry-over cap, carry-over expiry**; add a region/base; **regional calendars**; **restricted days** — all inline. *[extends 19.3, Epic 10]*
- **AD6 (High) — Employee-level settings (one page):** employee list with **activate/deactivate**; click a name to edit **email, first name, last name, region, department, approver level 1/2/…**, and manage that person's **allowance, pending queue, and add-leave-on-behalf** — all together in the one employee view. *[extends 19.3, Epic 9]*
- **AD7 (Med) — Expose Department.** The department field isn't visible today; make it visible and editable on the employee record. *[new]*
- **AD8 (Med) — Change-safety on sensitive edits.** Before changing region/rule/department, either prompt "are you sure?" or use a **save-at-end model that shows a diff** ("changing X → Y for this setting," N settings changing) before applying. *[new]*
- **AD9 (Med) — Allowance breakdown: add carry-over + grouping.** Add a **"Carry over from last year"** line and order/group the figures: **(Opening + Carry-over) = total held · (Taken + Pending) = used/requested · (Remaining, Available) = headline**, spaced by group. Applies to the Admin allowance view and the My-leave widget — reconcile with H4. *[extends H4]*
- **AD10 (Med, resolved DC3) — Manual edits go through a *typed* adjustment ledger.** No direct editing of opening/pending/remaining; all manual changes are append-only adjustment-ledger entries, and each entry lets HR pick **which bucket it credits (e.g. public-holiday days vs vacation days)**. The adjustment ledger itself was praised. *[new]*
- **AD11 (High, resolved DC4) — Multi-year balances & visibility (build it in).** Define how balances roll **2026→2027** (storage + calculation) and surface per-year ledgers in Admin: see prior years (e.g. 2025), show the **year** in allowance management, show the previous year alongside current without re-selecting, and drill from a year's balance into that year's leave records. Real multi-year storage is confirmed as a build requirement; needs an ADR (data model). *[new]*

### Walkthrough-driven additions to the prioritized fix list
0. Branding & shell quick wins (G1, G2, G3, G4) — small, high-visibility, do alongside the responsive shell.
1–9 as above, with these inserts: the **Admin two-mode console (AD4–AD8)** is the single biggest rework Eddy called out (he flagged Admin as the weakest area); the **three-category abstraction (W10)** must be enforced server-side on the Team Calendar + Who's-off widget; the **side-peek Request (DB3)** and **Check-details redesign (R6)** sit with the Request/dashboard work; **multi-year (AD11/Epic 24)** is a confirmed workstream — write its ADR first.
