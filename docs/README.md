# OU7 — Project Documentation

Internal, self-hosted replacement for WhosOff for **Interesting Times DMCC**. Built by us, hosted by us, owned by us. Logs in with Google Workspace; manages leave, approvals, allowances, the team wall chart, holidays, notifications and reporting.

This folder is the **source of truth** for anyone — human or AI — building the app. Read the documents in this order.

## Read order

| # | Document | What it covers | Audience |
|---|---|---|---|
| 1 | [WhosOff-Replacement-PRD.md](../WhosOff-Replacement-PRD.md) | The product requirements — every feature, rule and data entity | Everyone |
| 2 | [WhosOff-Explained-Simply.html](../WhosOff-Explained-Simply.html) | Plain-English overview (open in a browser) | Non-technical stakeholders |
| 3 | [BEST-PRACTICES.md](BEST-PRACTICES.md) | Engineering best practices + lessons from comparable open-source projects | Engineers / AI builders |
| 4 | [ARCHITECTURE.md](ARCHITECTURE.md) | Tech stack, system design, repository structure, security | Engineers / AI builders |
| 5 | [PROJECT-PLAN.md](PROJECT-PLAN.md) | Phases, milestones, testing & CI/CD, definition of done | PM + engineers |
| 6 | [EPICS.md](EPICS.md) | Detailed epics → user stories → acceptance criteria | PM + engineers |
| 7 | [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | The 17-inspired UI system, light **and** dark themes | Designers / front-end / AI builders |
| 8 | [adr/](adr/) | Architecture Decision Records (the "why" behind big choices) | Engineers |
| — | [../design/tokens.css](../design/tokens.css) | Ready-to-use CSS variables (light + dark) | Front-end / AI builders |

## v2 planning (UX, performance & readiness)

v1 is feature-complete on `main`; these add-on docs scope the v2 quality pass. **Start with the PRD**, then the supporting docs. These do not change the v1 guardrails.

| Document | What it covers |
|---|---|
| [V2-PRD.md](V2-PRD.md) | The v2 add-on PRD — epics 17–23, build order, DoD additions (**start here**) |
| [V2-UX-AUDIT.md](V2-UX-AUDIT.md) | Whole-app UI/UX audit (findings H/M/L) + build order |
| [V2-UX-IDEAS-FROM-THE-FIELD.md](V2-UX-IDEAS-FROM-THE-FIELD.md) | Feature ideas from comparable tools, with guardrail checks |
| [V2-PERFORMANCE-RENDERING.md](V2-PERFORMANCE-RENDERING.md) | Next.js rendering & Core Web Vitals work |
| [V2-APP-READINESS-FIXES.md](V2-APP-READINESS-FIXES.md) | Accessibility, error handling, testing, data & security |
| [STRUCTURE-SECURITY-HOSTING.md](STRUCTURE-SECURITY-HOSTING.md) | How the app is wired (frontend / backend / database), a security review, and hosting options |

## v3 planning (WhosOff-parity, mobile fixes & go-live)

v1 + v2 are on `main`; v3 is the **active** backlog. It closes the gaps found by auditing the live WhosOff admin and acts on the confirmed product decisions. **Start with `V3-PRD.md`.**

| Document | What it covers |
|---|---|
| [V3-PRD.md](V3-PRD.md) | The **active** v3 backlog — epics 25–33, build phases A–E, the verified integration map (**start here**) |
| [WHOSOFF-V3-FEATURE-MAP.md](WHOSOFF-V3-FEATURE-MAP.md) | Full map of WhosOff's admin features (the source of the v3 gaps) |
| [adr/0014-…](adr/0014-coverage-and-clash-enforcement.md) | Coverage controls + staff-vs-staff clash enforcement |
| [adr/0015-…](adr/0015-leave-daycount-snapshots-and-region-moves.md) | Leave day-count snapshots & effective-dated region moves |

## Non-negotiable principles (the short version)

1. **Standalone.** No Notion agents, no n8n, no external runtime dependency. Notion is an *export target only*.
2. **No AI/ML in the running app.** Every calculation — allowance maths, day-counting, conflict detection, reports — is deterministic, tested software. AI may help us *build* it; it does not run inside it.
3. **Google Workspace SSO**, domain-restricted. No self-registration.
4. **Region-aware** (UAE, KSA, Beirut, Remote) for weekends, holidays and allowances.
5. **Reliability & extensibility first** — modular boundaries, high test coverage on the allowance engine, safe migrations, feature flags.
6. **Own the data.** Hosted on Vercel + managed Postgres now; portable to on-prem because the domain core is framework-agnostic.
7. **Overtime is out of scope.**

## Naming

- Product/working name: **OU7** (a "17" tool).
- Repository slug: `ou7`.
- Primary region/timezone for all scheduling: **Asia/Dubai**.

## Status

Planning complete. PRD + this documentation set are ready to hand to a build team (human or AI). Outstanding inputs from HR are tracked in PRD §14 (entitlement numbers, per-market carry-over rules, Notion target DB, Teams setup, branding assets).

v1 is feature-complete on `main`. v2 (UX, performance & readiness) is scoped in `V2-PRD.md`. **v3 (WhosOff-parity, mobile fixes & go-live) is the active backlog — see `V3-PRD.md`.**
