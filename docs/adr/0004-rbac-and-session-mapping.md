# ADR 0004 — RBAC guard & session→Employee mapping

**Status:** Accepted · **Date:** 2026-06-08 · **Deciders:** Build team

## Context

Epic 1.4 requires a central server-side authorization guard, and Epic 2 requires that a
verified Google login map to an OU7 `Employee` (no self-registration). We needed to decide
where identity lives, where authority is resolved, and how the two layers stay pure per the
`app/ → lib/ → core/` dependency rule.

## Decision

1. **Token carries identity; the DB carries authority.** The Auth.js JWT stores only the
   stable `employeeId` (plus email). Role, approver level, approver assignments and active
   status are resolved **fresh from Postgres on every guarded action** by `lib/rbac`. This
   makes HR role changes (Epic 2.4) apply immediately and keeps every action authorized
   server-side, at the cost of one indexed read per guarded call (cacheable later).

2. **Policy is pure; I/O is in `lib/`.** All "who may do what" decisions are pure,
   exhaustively-tested predicates in **`core/authz`** operating on an `Actor` value object
   (`core/types`). `lib/rbac` does the I/O — read the session, build the `Actor` from the DB,
   then ask `core/authz`. `core/` stays free of Next.js, HTTP and DB.

3. **Mapping + Google linking at sign-in.** The `jwt` callback resolves the verified email to
   an existing `Employee`, links `googleSub` on first sign-in, and refuses to link on a
   `googleSub` mismatch (returns a null `employeeId`, which the guard then blocks).

4. **Email fallback for post-sign-in provisioning.** If a token has no `employeeId` (the user
   signed in before HR provisioned them), `lib/rbac` falls back to resolving the `Employee`
   by email — so a newly-provisioned user gets access **without** signing out and back in.

5. **Unprovisioned/inactive → blocked, not denied.** A domain-valid Google account with no
   active `Employee` still gets a session but is blocked by the guard and shown
   `/not-provisioned` ("contact HR"). The page lives **outside** the `(app)` route group so
   the shell guard doesn't redirect-loop.

6. **Guard at the server layout/handler, not edge middleware.** Role resolution needs Prisma,
   which can't run on the edge, so guarding happens in the `(app)` server layout (pages) and
   via `withAuth`/`requireActor` (route handlers + server actions). No `middleware.ts` role
   logic.

7. **Flat `lib/*.ts` layout retained.** `docs/ARCHITECTURE.md §4` sketches `lib/auth/`,
   `lib/db/` directories; the scaffold uses flat files (`lib/auth.ts`, `lib/db.ts`,
   `lib/env.ts`, now `lib/rbac.ts`). We keep the flat layout to match the existing scaffold;
   this is a deliberate, noted deviation from the sketch, not a divergence in responsibility.

## Consequences

- Authorization is centralised and testable: `core/authz` has exhaustive unit tests; the
  mapping + guard have integration tests against real Postgres (in a separate Vitest project,
  `npm run test:integration`, run by CI after `prisma migrate deploy`).
- Page guards make those routes dynamic (server-rendered), which is expected.
- A future need for lower latency can add a short-TTL cache of the `Actor` without changing
  the policy layer or call sites.

## Alternatives considered

- **Bake role into the JWT** — rejected: role changes wouldn't apply until token refresh, and
  every action should be authorized against current DB state.
- **Edge middleware for RBAC** — rejected: no Prisma on the edge; would force a second source
  of truth or a network hop.
- **Deny sign-in for unprovisioned users** — rejected: worse diagnostics and a generic Google
  error; the blocked-with-message approach is friendlier and easier to support.
