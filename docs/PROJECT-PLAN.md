# Project Plan

How we sequence the build, what "done" means, and how we keep quality high. Pairs with [EPICS.md](EPICS.md).

---

## 1. Phases & milestones

### Phase 0 — Foundation (Epic 1)

Stand up the skeleton before any feature: repo, Next.js + TS + Tailwind, Prisma + Postgres, Auth.js with Google SSO, CI pipeline, design tokens, app shell, RBAC guard, `core/` scaffolding with the first tests. **Exit:** a logged-in user sees an empty, themed, role-aware shell; CI is green.

### Phase 1 — MVP / WhosOff parity (Epics 2–11)

Everything needed to replace WhosOff for daily use:

- Employee directory + Google Directory sync + profiles
- Leave types & policy config
- Allowance engine (upfront entitlement, pro-rata, per-market carry-over, deductions)
- Request → preview → submit, with conflict + over-booking blocks and conditional uploads
- Approval workflow (single approver, optional multi-level, HR fallback) + cancellation rules
- Team wall chart (grouping, filters, half-days, holidays, export, print)
- My Leave (history, cancel, send reminder, allowance panel)
- Dashboard (allowances donut, next 7 days, request widget)
- HR admin console (employees, allowances, leave types, departments/regions/tags, public holidays, restricted days, min staffing, approver routing, branding)
- Notifications: email + Teams DMs; the Friday Who's-Off digest
- Calendar feeds (iCal) + balance report + CSV export
- Audit log
- **Migration** from WhosOff + parallel-run validation

**Exit:** WhosOff subscription can be cancelled; all staff onboarded via Google SSO; balances reconcile to source.

### Phase 2 — Automation & analytics (Epics 12–13)

Quarterly/annual + rule-based analytics reports; integrity-check dashboard; unused-leave reminders; HR notifications (birthdays/probation/anniversaries); scheduled Notion export; dashboard customisation; Google Calendar push.

### Phase 3 — Extensibility (Epic 14)

Versioned public REST API + webhooks; advanced analytics; optional native mobile; revisit adjacent HR workflows only if prioritised.

---

## 2. Suggested sequencing (dependency-aware)

```
Epic 1 Foundation
   └─▶ Epic 2 Employees/Provisioning ─▶ Epic 3 Leave Types ─▶ Epic 4 Allowance Engine
                                                                    │
        ┌───────────────────────────────────────────────────────────┘
        ▼
   Epic 5 Request & Approval ─▶ Epic 6 Wall Chart ─▶ Epic 7 My Leave ─▶ Epic 8 Dashboard
        │
        ▼
   Epic 9 HR Admin Console ─▶ Epic 10 Holidays/Regions ─▶ Epic 11 Notifications
        │
        ▼
   Epic 15 Design System (runs alongside from Phase 0) · Epic 16 Platform/DevOps (continuous)
        │
        ▼
   Epic 12 Reports · Epic 13 Calendar feeds + Notion export · Epic 14 API/Webhooks (Phase 3)
```

The **allowance engine (Epic 4)** is the critical path and the highest-risk logic — build and test it early and hard.

---

## 3. Testing strategy

| Level | Tool | Scope | Bar |
|---|---|---|---|
| Unit | Vitest | `core/` pure logic (allowance, calendar, conflicts, approvals) | Exhaustive; ~100% on the allowance engine |
| Integration | Vitest + real Postgres (CI service) | API handlers, RBAC, state transitions, adapters (mocked at boundary) | All critical paths |
| E2E | Playwright | Sign-in (mock IdP), book→preview→submit, approve/decline, wall chart, HR add-leave | All hot paths green pre-merge |

Seed a dedicated test DB; never touch production. Validate env vars at boot. Every fix/feature ships with tests.

---

## 4. CI/CD gates

On each PR (GitHub Actions): `install → typecheck → lint → unit → (spin up Postgres) → migrate → integration → e2e → build`. All green to merge. Vercel preview deploy per branch; production on merge to `main`; one-click rollback. Migrations are an explicit reviewed step; secrets live in Vercel/Actions secret stores.

> **Playwright-in-CI is not yet enabled (tracked go-live follow-up).** As of Epic 22.5 the CI job (`.github/workflows/ci.yml`) runs `typecheck → lint → unit → migrate → integration → build`; the two e2e steps are present but **commented out** (`# - run: npx playwright install --with-deps chromium` and `# - run: npm run e2e`). Enabling them is a **one-line uncomment of each** — no other change is needed (the specs already sign in via the E2E credentials provider). It is not yet done because committing a workflow change requires a `workflow`-scoped push token, which the build automation lacks. **Until then the named hot-path request→approve→cancel flow is CI-covered server-side** by `tests/integration/request-approve-cancel.test.ts` (PENDING→APPROVE debits via `core/allowance`→CANCEL restores); the Playwright e2e of the same flow + SSO + wall chart run locally and are CI-ready.

---

## 5. Definition of Ready (before a story starts)

- Acceptance criteria written and testable.
- Dependencies available (APIs, data, design tokens).
- Region/edge cases identified (weekends, holidays, part-days, base change).
- Design reference linked (DESIGN-SYSTEM.md component or state).

## 6. Definition of Done (before a story merges)

- Code + tests (unit/integration/e2e as appropriate) passing in CI.
- Meets acceptance criteria; reviewed and approved.
- Accessible (keyboard + contrast) for any new UI. The `eslint-plugin-jsx-a11y` **recommended** ruleset runs as part of `npm run lint` in the CI `build-and-test` gate (errors fail the build); any violation must be fixed (no blanket rule disables).
- Works in **both light and dark** themes.
- **Hot-path test coverage exists (Epic 22.5):** the named hot paths have passing tests and the allowance engine unit tests are **exhaustive**. Specifically: (a) `core/allowance` is exhaustively unit-tested across pro-rata, carry-over (cap + clamp + null-market), the full Remaining ledger (adjustments/deductions), `canBook` over-booking hard-block, half-days, and the non-carry Remote holiday bucket (`tests/unit/allowance.test.ts` + `tests/unit/allowance-exhaustive.test.ts`); (b) the leave-request **zod** schema is unit-tested (`tests/unit/leave-schema.test.ts`); (c) **request → approve → cancel** is covered **server-side in CI** by `tests/integration/request-approve-cancel.test.ts` (allowance DEBITED on approve, RESTORED on cancel); (d) Playwright e2e specs cover SSO sign-in (`sso.spec.ts`), request→approve→cancel (`request`/`approvals`/`cancellation`/`myleave-cancel`), wall chart (`wall-chart.spec.ts`), and async Server Components (dashboard/wall-chart/my-leave specs) — **CI-ready, pending the Playwright-in-CI uncomment noted under §4**.
- **Core Web Vitals targets met (Epic 21.4):** **LCP ≤ 2.5s**, **INP ≤ 100ms** (and legacy **FID ≤ 100ms**), and **low CLS** (no new layout shift on a route's load). Measured with **Lighthouse** (incognito), the **Web Vitals** Chrome extension, the in-app **`useReportWebVitals`** reporter (`components/WebVitals.tsx`, dev-only console — never transmitted), and **Unlighthouse** across routes. An **Unlighthouse run is recorded before go-live** and any regression against these targets is **flagged** and resolved before merge/release.
- Docs/ADR updated if behaviour or a decision changed.
- Migration reviewed; feature behind a flag if risky.
- No new high/critical security or dependency alerts.

---

## 7. Environments

| Env | Host | Database | Purpose |
|---|---|---|---|
| Local | `docker-compose` (app + Postgres) | local Postgres | development |
| Preview | Vercel preview (per branch) | ephemeral/branch DB | review & QA |
| Production | Vercel | managed Postgres | live |

All scheduling and date logic runs in **Asia/Dubai**.

---

## 8. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Allowance maths wrong (esp. pro-rata, carry-over, base change) | High — trust & payroll | Pure `core/` engine, exhaustive unit tests, parallel-run reconciliation vs WhosOff |
| Region/holiday edge cases (different weekends) | Medium | Region-first calendar module with explicit per-market tests |
| Google SSO / domain restriction misconfig | High — access | Env validation, mocked-IdP E2E, staging verification |
| Teams Graph API setup (admin consent) | Medium | Email works standalone; Teams behind a flag until Azure app is approved |
| Scope creep (HRIS, overtime, AI) | Medium | Non-goals are explicit in PRD; guard in review |
| Migration data gaps | Medium | One-time HR data collection + integrity report before cutover |

---

## 9. Outstanding inputs (blockers to finalise, not to start)

Tracked in PRD §14: per-region/role entitlement numbers, per-market carry-over rules, Notion target database, Teams Azure app/admin consent + digest channel, and branding assets (logo, palette confirmation, display name).
