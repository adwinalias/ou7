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

## Current state (start here)
Scaffolded and verified: tooling, CI, Prisma schema + seed, the `core/` engine (allowance, calendar, leave validation — tests pass), Auth.js Google SSO config, env validation, the app shell with working light/dark switch, and route **stubs** for dashboard/wall-chart/my-leave/request/approvals/admin. The route pages are placeholders — your job is to build them out per the epics, starting with finishing **Epic 1** (RBAC guard + session→Employee mapping) and the **Epic 5** request→preview→submit slice on top of the already-tested `core/leave`.
