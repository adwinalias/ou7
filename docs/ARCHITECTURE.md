# Architecture

How OU7 is built. This is the technical companion to the PRD. Decisions here are recorded as ADRs in [adr/](adr/).

---

## 1. Principles

1. **Deterministic core.** All business logic is pure, typed, tested functions. No AI/ML at runtime.
2. **Framework-agnostic domain.** The engine doesn't know about Next.js, HTTP, or the database. This is what makes us portable off Vercel later.
3. **Modular boundaries.** Each feature area is a module with a clear public surface; cross-module calls go through interfaces, not internals.
4. **Standard Postgres.** Relational integrity for allowances and approvals; no exotic storage.
5. **Config over code.** Leave types, regions, holidays, carry-over rules, approval routing are data, editable by HR — not code changes.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | **TypeScript** (strict) | One language across the stack; typed domain model. |
| Framework | **Next.js (App Router)** on **Vercel** | Already paid for. Route handlers + server actions. |
| UI | **React + Tailwind**, design tokens | Theming via tokens (see DESIGN-SYSTEM.md); light + dark. |
| Domain core | Plain TS in `core/` | Allowance engine, date/region maths, policy rules. Pure, no I/O. |
| Data access | **Prisma ORM** | Typed queries + versioned migrations. |
| Database | **Managed PostgreSQL** (Neon / Vercel Postgres) | Standard SQL; portable. |
| Auth | **Auth.js (NextAuth)** + Google OIDC | Domain-restricted; optional TOTP MFA. |
| Background jobs | **Vercel Cron** → route handlers | Reports, reminders, integrity checks, year-end archival. Asia/Dubai. |
| Email | Workspace SMTP or SES/Postmark | Transactional + digests. |
| Teams | **Microsoft Graph API** | Direct-message notifications (Azure app + admin consent). |
| Validation | **Zod** | Request bodies + env-var schema validation at boot. |
| Tests | **Vitest** (unit/integration) + **Playwright** (E2E) | See PROJECT-PLAN.md. |
| CI/CD | **GitHub Actions** + Vercel | Lint, typecheck, test (with Postgres service), build, deploy. |

> If long-running/stateful workloads ever outgrow serverless, the `core/` + Prisma layers lift into a small containerised worker without touching domain logic.

---

## 3. System diagram

```
                         ┌─────────────────────────────────────────┐
   Google Workspace ───▶ │  Auth.js (OIDC, domain-restricted, MFA) │
   (SSO + Directory)     └─────────────────────────────────────────┘
          │                              │
          │ directory sync (cron)        ▼
          │                   ┌──────────────────────┐      ┌──────────────────────┐
          └──────────────────▶│  Next.js app (Vercel) │◀────▶│  PostgreSQL (managed) │
                              │  • UI (React/Tailwind)│      │  • employees, leave,  │
                              │  • API route handlers │      │    allowances, audit  │
                              │  • core/ domain engine│      └──────────────────────┘
                              └──────────┬───────────┘
                                         │ adapters (one-way out)
        ┌────────────────────────────────┼───────────────────────────────┐
        ▼                                 ▼                                ▼
 ┌────────────┐                   ┌──────────────┐                ┌──────────────┐
 │   Email    │                   │  MS Teams    │                │   Notion     │
 │ (SMTP/SES) │                   │  (Graph DMs) │                │ (export only)│
 └────────────┘                   └──────────────┘                └──────────────┘
        ▲
        │ Vercel Cron → reports, reminders, integrity checks, year-end archival (Asia/Dubai)
```

Everything outbound (Email, Teams, Notion, Calendar feeds) is an **adapter** behind an interface. The app never *reads* from Notion.

---

## 4. Repository structure

Single Next.js app, feature-organised, with an isolated domain core. (Monorepo is overkill for one app; we keep `core/` as an internal module that *could* be extracted to a package later.)

```
ou7/
├─ app/                         # Next.js App Router — routes only
│  ├─ (auth)/                   # sign-in, callback
│  ├─ (app)/                    # authenticated shell
│  │  ├─ dashboard/
│  │  ├─ wall-chart/
│  │  ├─ my-leave/
│  │  ├─ request/               # request + preview + submit
│  │  ├─ approvals/             # approver queue
│  │  └─ admin/                 # HR console (employees, allowances, config, reports)
│  └─ api/                      # route handlers
│     ├─ leave/route.ts
│     ├─ approvals/route.ts
│     ├─ cron/                  # report/reminder/integrity/archival jobs
│     └─ export/notion/route.ts
├─ core/                        # ★ framework-agnostic domain (pure TS, no I/O)
│  ├─ allowance/                # entitlement, pro-rata, carry-over, balance maths
│  ├─ calendar/                 # region weekends, holidays, working-day counting
│  ├─ leave/                    # request validation, conflict + over-booking checks
│  ├─ approvals/                # state machine, routing, escalation rules
│  └─ types.ts                  # shared domain types
├─ lib/                         # I/O + integrations (server-side)
│  ├─ db/                       # Prisma client + repositories
│  ├─ auth/                     # Auth.js config, RBAC guards
│  ├─ notify/                   # email + Teams adapters (interface-based)
│  ├─ notion/                   # export adapter (one-way out)
│  └─ calendar-feed/            # iCal generation
├─ components/                  # global reusable UI (buttons, table, inputs, calendar grid)
├─ design/                      # tokens.css, theme provider
├─ prisma/                      # schema.prisma + migrations/ + seed.ts
├─ utils/                       # pure helpers (dates fmt, formatting) — kept small & split
├─ tests/
│  ├─ unit/                     # Vitest — core/
│  ├─ integration/              # Vitest — API + DB
│  └─ e2e/                      # Playwright
├─ .github/workflows/ci.yml
├─ docs/                        # this documentation set travels with the repo
├─ Dockerfile                   # for on-prem portability
├─ docker-compose.yml           # local dev (app + postgres)
└─ package.json
```

**Rule of dependency direction:** `app/` → `lib/` → `core/`. `core/` depends on nothing outward. `components/` are presentational and take data via props.

---

## 5. Key flows (how the pieces cooperate)

**Book leave.** `app/request` → calls `core/leave.validateRequest()` (region working days, conflicts, over-booking against `core/allowance.available()`) → preview returned → on submit, `lib/db` persists a `Pending` request → `lib/notify` messages the approver (email + Teams DM).

**Approve.** `app/approvals` → `core/approvals.transition(Pending → Approved)` (checks RBAC, fallback-to-HR rules) → `lib/db` writes + debits allowance via `core/allowance` → notifies requester → appears on wall chart.

**Allowance is computed, never hand-stored.** `core/allowance` derives Remaining / Available from Opening + carry-over + adjustments − taken − deductions, with pro-rata by join date and per-market carry-over caps. HR "Reset/Add Balance" calls the same engine.

**Scheduled jobs.** Vercel Cron hits `app/api/cron/*` on Asia/Dubai schedules: Friday Who's-Off digest, quarterly/annual reports, unused-leave reminders, integrity checks, year-end archival, scheduled Notion export.

---

## 6. Security architecture

- Auth.js session (short-lived, refreshed); Google OIDC with `hd` domain restriction; optional TOTP MFA per role.
- Central **RBAC guard** wraps every route handler and server action: resolves the user's role + approver assignments and authorizes the specific action/record.
- Prisma parameterised queries; Zod validation on all inputs; CSRF protection on mutations; rate limiting on auth + request endpoints; standard security headers.
- Attachments stored in access-controlled object storage, HR-only, with a 2-year TTL auto-purge job.
- Immutable `AuditEvent` written for every admin/approval action.

See PRD §5, §8 for the full requirements; data entities in PRD §7.

---

## 7. Portability (cloud → on-prem)

Because `core/` is pure and the DB is standard Postgres, moving on-prem means: build the included `Dockerfile`, point `DATABASE_URL` at the on-prem Postgres, supply the same env vars, and run migrations. No domain code changes. Vercel-specific bits (Cron, edge) are isolated behind `app/api/cron/*` and can be replaced by a system cron hitting the same endpoints.
