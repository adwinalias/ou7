# Engineering Best Practices & Reference Projects

What we should put in place **before and during** the build. Distilled from (a) established open-source leave/HR products and (b) current Next.js + PostgreSQL production practice. Sources are linked at the bottom.

---

## 1. What we learned from comparable open-source projects

We reviewed real, starred leave-management codebases so we copy what works and skip what doesn't.

### TimeOff.Management (`timeoff-management-application`, ~1k★, MIT, Node.js + Sequelize)

The closest analogue to what we're building. Its feature set independently validates our PRD — and its structure is a useful baseline.

What it does that we should match:

- **Three views of absence:** calendar, team, and plain list. (We have the same: wall chart, team/approvals, My Leave.)
- **Custom absence types** with a per-type flag for *"does this use up vacation allowance?"* and an **optional annual cap per type** (e.g. max 10 sick days/year). We adopt both.
- **Public holidays + company-specific days off**, **departments with a supervisor**, and **customisable working schedules** for the company and individuals. Matches our region/work-pattern model.
- **Calendar feeds** to Outlook / Google / iCal for individuals, departments, or the whole company. We adopt this.
- **Three-step workflow:** request → supervisor email + decision → accounted + peers informed. This is exactly our approval flow.
- **Roles:** employee / supervisor / administrator. Maps to our Staff / Approver / HR.
- **Pro-rated allowance on start date** and **manual allowance adjustments** (e.g. a day in lieu). We adopt both.
- **CSV export** of all company leave data. We adopt (plus our Notion export).
- **"Force pick leave type" config** to cut mistaken bookings; **locale-aware sorting**. Small but worth copying.
- Mobile-friendly for the two hot paths (request leave; record a decision).

What we deliberately do **differently / better:**

- **TypeScript + a typed schema** instead of plain JS — the allowance maths must be type-safe and unit-tested.
- **Google SSO** as the default (they bolt on optional LDAP); domain-restricted, no passwords.
- **Region-first** model (UAE/KSA/Beirut/Remote weekends + holidays) baked into the date engine, not an afterthought.
- **Microsoft Teams** notifications in addition to email.
- **No overtime** (they include it; we cut it for simplicity).
- **No AI** anywhere (neither do they, but we make it an explicit, enforced principle).

### Others scanned for patterns

- **Jorani** — PHP/CodeIgniter leave + overtime; strong on delegation and multi-level validation chains. Confirms our "single approver + optional multi-level + HR fallback" model is standard.
- **OrangeHRM / Frappe HR** — full HRIS. Useful reminder of where to draw the scope line: we are a focused leave tool, **not** an HRIS (no payroll/performance/recruiting).

**Takeaway:** our PRD is well within proven territory. The differentiators (region engine, Google SSO, Teams, Notion export, no-AI determinism, clean modern stack) are the value, not the risk.

---

## 2. Repository & code structure (Next.js App Router)

Principles from current Next.js production guidance:

- **Feature-based organisation.** Never overcrowd the root `app/` folder. Group by domain feature (leave, approvals, wall-chart, admin), keep each self-contained.
- **`app/`** holds routes only — `page`, `layout`, `loading`, `error`, and `app/api/**/route.ts` for endpoints.
- **`components/`** = global, reusable, presentational UI (buttons, inputs, table). No feature logic here.
- **`lib/`** = business logic, data access, integrations (the place server-side queries live).
- **`core/` (our addition)** = the **framework-agnostic domain layer**: allowance engine, day/region calculator, approval rules, policy validation. No Next.js, no HTTP, no DB driver imports — pure functions over plain types. This is what guarantees portability (PRD §9) and is the most heavily unit-tested code.
- **`utils/`** = pure, stateless helpers. Resist the 2,000-line `utils.ts`; split by purpose.
- Avoid accidental client/server crossover — keep server-only code out of client bundles.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the concrete folder tree.

---

## 3. Testing strategy

A tested allowance engine is the single most important quality bar in this project. Adopt a testing pyramid:

- **Unit (Vitest)** — the `core/` domain layer: allowance maths, pro-rata on join date, carry-over caps per market, half-day handling, region weekend/holiday counting, conflict detection, over-booking blocks. Aim for very high coverage here; these are pure functions, cheap to test exhaustively.
- **Integration** — API route handlers against a **real Postgres** (spun up in CI), with Prisma migrations applied. Validate approval state transitions, RBAC, and Notion/Teams adapters (mocked at the boundary).
- **End-to-end (Playwright)** — the hot user paths: sign in with Google (mocked IdP in CI), book leave → preview → submit, approve/decline, wall-chart renders correctly, HR adds leave on behalf.
- **Seed test data** in the test DB; never touch production data. Validate env vars on build/start.

Any bug fix or feature should ship with tests. This is the gate to `main`.

---

## 4. CI/CD (GitHub Actions + Vercel)

- **On every PR:** install → typecheck → lint → unit tests → spin up a **Postgres service container** → run migrations → integration tests → Playwright E2E → build. All must pass to merge.
- **Preview deploys:** Vercel builds a preview URL per branch automatically — use it for review and QA.
- **Production:** merge to `main` → Vercel production deploy. **One-click rollback** to the previous deployment.
- **Migrations** run as an explicit, reviewed step (never auto-destructive). Forward-only, backward-compatible where possible.
- **Secrets** in Vercel's encrypted env store + GitHub Actions secrets. Never in the repo.
- Environment-variable **schema validation** at boot (e.g. with Zod) so a misconfigured deploy fails fast and loudly.

---

## 5. Security & privacy practices

- **Google OAuth2/OIDC**, restricted to the company domain (`hd` check); reject external accounts. Optional TOTP MFA, enforceable for HR.
- **Server-side authorization** on every action, checked against role + approver assignment. Never trust the client.
- **Least privilege**; HR-only data (medical/bereavement docs) access-restricted and **auto-deleted after 2 years**.
- **OWASP basics:** parameterised queries (Prisma), input validation, output encoding, CSRF protection on mutations, rate limiting on auth and request endpoints, security headers.
- **Encryption** in transit (TLS) and at rest; **encrypted, tested backups** with periodic restore drills.
- **Audit log** of all admin actions and approvals (immutable, who/what/when/before/after).

---

## 6. Ways of working

- **Conventional Commits** + small, reviewed PRs; at least one approval before merge.
- **ADRs** for significant decisions (see [adr/](adr/)) so the "why" is never lost.
- **Feature flags** to ship behind a switch and roll back safely.
- **Definition of Done** enforced (tests, a11y check, docs updated, migration reviewed) — see [PROJECT-PLAN.md](PROJECT-PLAN.md).
- **Accessibility (WCAG 2.1 AA)** for core flows from day one, not retrofitted.
- **Dependency hygiene** — Dependabot/renovate, lockfile committed, no abandoned packages in the critical path.

---

## Sources

- [TimeOff.Management — GitHub repo](https://github.com/timeoff-management/timeoff-management-application)
- [`leave-management` GitHub topic](https://github.com/topics/leave-management)
- [Jorani — open-source leave & overtime](https://jorani.org/)
- [Next.js — Project Structure (official)](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js 14 App Router structure patterns (DEV)](https://dev.to/pipipi-dev/app-router-directory-design-nextjs-project-structure-patterns-31eo)
- [The Ultimate Guide to Testing with Prisma: CI Pipelines](https://www.prisma.io/blog/testing-series-5-xWogenROXm)
- [nextjs-prisma-boilerplate (Jest/Cypress/GitHub Actions reference)](https://github.com/nemanjam/nextjs-prisma-boilerplate)
- [tRPC + Next + Prisma starter with E2E testing](https://github.com/trpc/examples-next-prisma-starter)
