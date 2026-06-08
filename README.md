# OU7

Internal **leave & absence management** for Interesting Times DMCC — a self-hosted replacement for WhosOff. Sign in with Google Workspace; book leave, approve it, see the team wall chart, track allowances per market, and report. We own the data; Notion is an export target only; **no AI runs in the app** (all calculations are deterministic software).

> Name: **OU7** ("OUT"). A 17 tool. Timezone for all scheduling: **Asia/Dubai**.

## Stack

TypeScript · Next.js (App Router) on Vercel · Prisma + PostgreSQL · Auth.js (Google OIDC) · Tailwind + design tokens (light + dark) · Vitest + Playwright · GitHub Actions. Domain logic lives in a framework-agnostic `core/` layer so the app stays portable (containerised) to on-prem.

## Quick start

```bash
cp .env.example .env          # fill in Google OIDC + secrets
docker compose up -d          # local Postgres
npm install
npm run db:generate
npm run db:migrate            # create schema
npm run db:seed               # regions, departments, leave types
npm run dev                   # http://localhost:3000
```

## Layout

```
app/        Next.js routes (UI + /api route handlers)
core/       framework-agnostic domain (allowance engine, calendar, rules) — pure & tested
lib/        I/O & integrations (db, auth, env, notify, notion)
components/  reusable UI (token-driven, light + dark)
design/     tokens.css (design system) + design-preview.html
prisma/     schema + migrations + seed
tests/      unit (Vitest) · e2e (Playwright)
docs/       PRD, architecture, project plan, epics, design system, ADRs  ← read docs/README.md first
```

## Docs

Start at [`docs/README.md`](docs/README.md). The product spec is [`WhosOff-Replacement-PRD.md`](WhosOff-Replacement-PRD.md); the backlog is [`docs/EPICS.md`](docs/EPICS.md); the UI system is [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md).

## Principles

Standalone (no Notion/n8n at runtime) · Google SSO, domain-restricted · region-aware (UAE/KSA/Beirut/Remote) · deterministic, no AI · reliability & extensibility first · overtime out of scope.
