# OU7 — v2 Feature Ideas (from comparable tools)

Concrete patterns worth building into v2, drawn from how mature leave tools and open-source peers work. All checked against OU7's guardrails: no AI/ML at runtime, standalone (exports are one-way out), Google SSO only, region-aware, balances computed by `core/allowance`, overtime out of scope.

Priority: **P1** = build in v2 · **P2** = plan in · **P3** = later.

## P1

1. **Role-aware, customizable widget dashboard.** Default tile layout the user can add / remove / reorder, with role-gated tiles. Tiles: My allowance, My next 7 days, Who's off, Pending approvals (approvers), Upcoming holidays/events, Alerts (later). (Decision #2.)
2. **Force-pick leave type + fix the default.** Default to "Select a leave type…" (or Vacation), and add an HR config flag to require explicit selection — reduces mistaken leaves that get cancelled later. (Resolves audit R1.)
3. **Mobile-first core paths.** The bottom tab bar (decision #4) plus making Request and Approvals genuinely usable one-handed on a phone. Biggest current gap.
4. **Live allowance-impact in the request form.** A panel that updates as dates change — "uses 6 working days · 2 non-working · leaves 14" — instead of gating impact behind a separate step. (Resolves R2/H4; `core/allowance` already computes this.)
5. **One allowance breakdown everywhere.** Reuse the My-leave table's labelled Opening / Remaining / Pending / Available on the dashboard so the numbers can't read as contradictory. (Resolves H4.)

## P2

6. **Month "Calendar view" beside the wall-chart grid.** OU7 has the team grid (wall chart) and the list (My leave); add a familiar month calendar of "who's off this month."
7. **Per-leave-type rules in config.** Each type carries a "counts against allowance?" flag and an optional annual cap (e.g. max 10 sick days/year) with a visible counter, validated in `core/`.
8. **Read-only iCal/ICS feed export.** A one-way `.ics` subscription URL (per person / department / company) so leave shows in Google/Outlook without a two-way integration. Outbound-only, so standalone-safe.
9. **"Upcoming holidays / events" widget.** Region-aware next public holidays + company days from the calendar engine.
10. **Alerts / nudges widget.** Deterministic, rule-based: "carry-over expires in N days," "a request has waited on you for 3 days," "0 days booked this year." Rules in `core/`, not a recommender.
11. **One shared leave-type + status key component**, reused on every calendar surface so colour/letter meanings never drift. (Resolves M2.)

## P3

12. **Borrow component patterns (not a framework).** Keep OU7's token system; a ⌘K command palette ("request leave," "jump to a person," "go to wall chart") is a cheap power-user win.
13. **A couple of small HR charts** (absence trend, allowance utilisation) in reports — minimal, on-brand, reduced-motion safe.
14. **Bulk approve / decline** in the approvals queue, once the populated queue exists.

## Deliberately out of scope

- **AI leave assistants / auto-approval models** — violates the no-AI-at-runtime guardrail (ADR 0003). All logic stays deterministic in `core/`.
- **Two-way Google/Outlook calendar sync** — adds a runtime integration/dependency; use the read-only ICS feed (#8) instead.
- **Wholesale UI-framework swap** (shadcn/MUI/Chakra) — borrow patterns, keep the token-based design system.
