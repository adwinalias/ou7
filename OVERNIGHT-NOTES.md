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
