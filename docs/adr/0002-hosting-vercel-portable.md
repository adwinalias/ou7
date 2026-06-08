# ADR 0002 — Host on Vercel, stay portable

**Status:** Accepted · **Date:** 2026-06-08 · **Deciders:** Eddy (Transformation), build team

## Context

The org already pays for Vercel and wants minimal ops. It also wants to own its data, with the option to move to an on-prem server later. "Run on Vercel" and "containerised for on-prem portability" are in mild tension.

## Decision

Ship **Vercel-native now** (Next.js app, route handlers, Vercel Cron, managed PostgreSQL such as Neon/Vercel Postgres). Keep the **domain core framework-agnostic** and the database **standard Postgres**, and include a `Dockerfile` + `docker-compose.yml`. On-prem/data-residency is **not** a near-term hard requirement.

## Consequences

- Fast, cheap, near-zero-ops launch on paid infrastructure.
- Moving on-prem later = build the Docker image, point `DATABASE_URL` at on-prem Postgres, replace Vercel Cron with system cron hitting the same endpoints. No domain changes.
- We avoid Vercel-only data stores/primitives in the domain layer to prevent lock-in.

## Alternatives considered

- **Container-first from day one** — maximal portability but more ops now, and ignores the paid Vercel investment. Revisit only if UAE data residency becomes a hard near-term requirement.
