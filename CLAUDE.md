# CLAUDE.md — working agreement for OU7

You are building **OU7**, an internal leave & absence tool for Interesting Times DMCC (a self-hosted WhosOff replacement). This file is the contract. Read it fully before coding. The full spec is in `docs/` — **always consult it**; this file is the summary, `docs/` is the source of truth.

## Read these first
- `docs/README.md` — index + read order.
- `WhosOff-Replacement-PRD.md` — what to build (every feature + rule).
- `docs/EPICS.md` — **the backlog you work from** (16 epics, stories, acceptance criteria).
- `docs/ARCHITECTURE.md` — stack, repo layout, dependency rules.
- `docs/PROJECT-PLAN.md` — phases, testing strategy, Definition of Done.
- `docs/DESIGN-SYSTEM.md` + `design/tokens.css` — the UI system (light + dark).

## Non-negotiable guardrails
1. **No AI/ML at runtime.** Every calculation is deterministic, tested code in `core/`. Never add an LLM/model call to the running app. (ADR 0003.)
2. **Standalone.** No Notion/n8n as a runtime dependency. Notion is an **export target only** (one-way out).
3. **Auth = Google Workspace SSO**, domain-restricted (`ALLOWED_EMAIL_DOMAIN`). No self-registration. Authorize every action server-side.
4. **Region-aware always** (UAE/KSA/Beirut/Remote differ on weekends, holidays, carry-over). Use `core/calendar` + the region data — never hard-code a weekend.
5. **Balances are computed, never hand-stored** — always via `core/allowance`. Allowance is granted upfront (pro-rated for joiners); carry-over is per-market; over-booking is hard-blocked.
6. **Overtime is out of scope.** Don't build it.
7. **All times Asia/Dubai** for scheduling and date logic.

## Architecture rules
- Dependency direction: **`app/` → `lib/` → `core/`**. `core/` is pure (no Next.js, no HTTP, no DB, no `process.env`). Keep it that way.
- `lib/` holds all I/O (Prisma in `lib/db.ts`, auth in `lib/auth.ts`, env in `lib/env.ts`, and future `lib/notify`, `lib/notion`).
- `components/` are presentational; data comes via props.
- Config (leave types, regions, holidays, carry-over rules, approval routing) is **data, not code** — editable by HR.

## Design rules
- Use the design tokens; **never hard-code a hex value** in a component. Themes via `data-theme="light|dark"` on `<html>`.
- Every screen must work in **both light and dark** and meet **WCAG AA**.
- **Grey is reserved for pending.** Approved = solid leave-type colour; pending = grey + coloured left bar; weekend = faint hairlines. Sharp corners, no gradients, no drop shadows except modals.

## How to work
- Work **one epic/story at a time** from `docs/EPICS.md`, smallest useful vertical slice first. Don't scaffold ten half-features.
- For anything non-trivial, **plan first** (use plan mode), confirm the approach, then implement.
- **Write tests with every change**: Vitest unit tests for `core/` (exhaustive on the allowance engine), integration tests for API + DB, Playwright for hot paths.
- A change is **done** only when: `npm run typecheck && npm run lint && npm test && npm run build` all pass, acceptance criteria are met, it works in both themes, and docs/ADRs are updated if behaviour changed. (Full DoD in `docs/PROJECT-PLAN.md`.)
- Keep commits small and use **Conventional Commits** (`feat:`, `fix:`, `test:`, `chore:`). One story ≈ one PR.
- Record significant decisions as a new ADR in `docs/adr/`.

### Build execution (v2) — hands-off orchestrator
The v2 build runs **hands-off**: this top-level session is the **orchestrator** and delegates to the subagents in `.claude/agents/` (implementer-core, implementer-app, test-runner, code-reviewer). Eddy is **not** in the per-story approval loop — the orchestrator, the `Stop`-hook gate (`.claude/hooks/gate.sh`), the brutal opus `code-reviewer`, and the GitHub `build-and-test` check are the approval authority. Work one story at a time from `docs/V2-PRD.md`, one PR each, on feature branches only (never push/merge `main` directly). **Full procedure + safety rails + merge policy: [`docs/BUILD-WORKFLOW.md`](docs/BUILD-WORKFLOW.md) (ADR-0012).** Pause for Eddy on unsettled product decisions, repeated gate failures, or anything needing a new ADR (e.g. Epic 24 multi-year storage → ADR-0013 first).

## Commands
```bash
npm install
npm run db:generate     # prisma client
npm run db:migrate      # apply schema to local Postgres (docker compose up -d first)
npm run db:seed         # regions, departments, leave types
npm run dev             # http://localhost:3000
npm run typecheck
npm run lint
npm test                # Vitest (core/ + tests/unit)
npm run e2e             # Playwright
npm run build
```

## CI & deploys
- **The merge gate is the GitHub Actions `build-and-test` job** (`.github/workflows/ci.yml`): typecheck → lint → unit → migrate → integration → build. Green there = mergeable.
- **Netlify deploy-preview checks (`ou7in17`) are a temporary experiment, not a gate.** The app targets **Vercel** (ADR-0002); the Netlify previews may fail and should be ignored when deciding to merge.

## Current state (start here)
**Read [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md) first — it is the live snapshot** (what's on `main`, the Netlify test deploy + env vars, locked policy values, integration status, known issues, and new-machine setup).

Short version (2026-06-09): OU7 is **feature-complete on `main`** — foundation/SSO/RBAC, the allowance engine (v2: month-based pro-rata + adjustments ledger + Reset; Remote holiday ledger), request→approve→cancel with engine-derived balances, wall chart, dashboard, My Leave, the full HR console, holidays/regions, audit log, branding, and the Netlify deploy config. **All PRs #1–#24 are merged; no open PRs.** It is **running on a Netlify test deploy** (`https://ou7in17.netlify.app`) with real Google sign-in. **Next:** a UX/performance **v2** pass (from a recorded walkthrough) and **go-live** (Vercel + near-region Postgres, then the WhosOff migration). The guardrails above still apply unchanged.
