# ADR 0001 — Technology stack

**Status:** Accepted · **Date:** 2026-06-08 · **Deciders:** Eddy (Transformation), build team

## Context

We are building a standalone, self-hosted leave tool to replace WhosOff. It must be reliable, extensible, easy to restyle, owned by us, and hostable on Vercel (already paid for) with a path to on-prem. The team chose a fully custom build.

## Decision

Build a single **TypeScript Next.js (App Router)** application:

- React + Tailwind + design tokens for UI (light + dark).
- A **framework-agnostic `core/` domain layer** (pure TS) for all business logic.
- **Prisma + PostgreSQL** for data with versioned migrations.
- **Auth.js + Google OIDC** for SSO; optional TOTP MFA.
- **Vercel Cron** for scheduled jobs; **Vitest + Playwright** for tests; **GitHub Actions** for CI.

## Consequences

- One language end-to-end; typed domain model; strong testability of the allowance engine.
- Vercel-native and low-ops now; portable later because `core/` and Postgres are not Vercel-specific.
- Trade-off: serverless is less suited to long-running jobs — mitigated by isolating such work behind cron endpoints, extractable to a container worker if needed.

## Alternatives considered

- **Django/FastAPI backend + separate SPA** — strong admin, but two languages and more ops; rejected for a single small team.
- **Adapt an open-source base (TimeOff.Management)** — faster start but constrains architecture, styling and the region/SSO model we need; rejected (see PRD decision).
