# OU7 — Project state & handover

**Live snapshot as of 2026-06-18** (v1 feature-complete on `main` since 2026-06-09; v2 planning added 2026-06-18). If you're a fresh Claude / Claude Code picking this up on a new machine, **read this first**, then `CLAUDE.md` (guardrails — still all valid), `docs/EPICS.md` (v1 backlog), and `docs/V2-PRD.md` (the v2 add-on backlog). Everything described as on `main` is built, reviewed, and merged.

## TL;DR
OU7 (self-hosted WhosOff replacement for Interesting Times DMCC) is **feature-complete on `main`** and **running on a Netlify test deploy with real Google sign-in**. Remaining work: the UX/performance/readiness **v2** pass (now scoped in `docs/V2-PRD.md`, epics 17–23) and the real **go-live** (Vercel + a near-region Postgres, then migration from WhosOff). **Immediately next:** Eddy is sharing a recorded UI/UX walkthrough in the next chat — process it into the v2 plan *before* building (see Next work §1).

## What's on `main` (all merged, CI green; PRs #1–#24, no open PRs)
- Foundation, **Google SSO** (domain-restricted), **RBAC** (`core/authz` + `lib/rbac`), app shell, light/dark theming.
- **Allowance engine** (`core/allowance`, pure + tested) — engine-v2: month-based pro-rata, append-only adjustments ledger, Reset/Add Balance (Epic 9.2). Remote **holiday ledger** (v2b) HR-set balance built. *Holiday consumption* (a holiday leave type deducting from the bucket) is **PLAN-ONLY** in `OVERNIGHT-NOTES.md`, not built.
- **Request → preview → submit → approve/decline** with engine-derived balances; **cancellation** (5.6) + **reminders** (5.7/7.2); **add-leave-on-behalf** (9.3); **company pending queue** (9.6).
- **Wall chart** (grid, grouping, filters, CSV, print), **dashboard** (donut, next-7, request widget), **My Leave** (history, allowance panel, holiday display, owner cancel/remind).
- **HR console:** employees + bulk import (9.1), HR logs (9.4), config hub + entitlement/carry-over policy (9.5), allowance management (9.2).
- **Holidays / regions / restricted days** (10.1/10.2/10.4). **Audit log** (16.1). **Branding** (logos wired + favicon). **Netlify deploy config** (`netlify.toml` + fail-fast env validation in `lib/env.ts`).
- ADRs through **0011** in `docs/adr/`. Stale `feat/*` branches can be deleted; main is the source of truth.

## Locked policy & decisions (HR-supplied — seeded as config, not code defaults)
- **Entitlement (annual opening):** UAE 22 · KSA 21 · Beirut 15 · Remote 22. **"Flex" = the Remote region** (not a per-region tier).
- **Carry-over:** cap **5 days**, expiry **31 Mar**, all regions. Remote *annual* leave carries; the Remote *holiday* bucket does NOT.
- **Pro-rata (joiners):** month-based — `annual ÷ 12 × (months from joining month through December)`, **rounded UP to a whole day**; full-year joiners get the full annual. (March joiner → UAE 19 / KSA 18 / Beirut 13.)
- **Reset / Add Balance:** recompute `opening` only; leave carry-over + adjustments intact; before→after preview. Not a clean-slate.
- **Adjustments:** append-only `AllowanceAdjustment` ledger; period columns are a derived projection.
- **Remote holiday bucket:** HR-set, **default 5, editable to any number**; separate ledger; non-carry; Remote-only. No auto pro-rata.
- **Seeded:** 4 regions, 9 leave types, the entitlement policy (region × role), and HR bootstrap admin **`adwin.alias@interestingtimes.me`** (HR/UAE) — this account is provisioned, so it can sign in and act as HR.

## Deployment (TEST) — Netlify site `ou7in17`
- URL `https://ou7in17.netlify.app`. **Production target remains Vercel** (ADR-0002); Netlify is a test deploy only.
- Build: `prisma generate && next build` via `@netlify/plugin-nextjs` (migrations are NOT run in the build).
- **Required env vars (set in the host's site settings — NEVER in the repo):** `DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAIL_DOMAIN`. App fail-fasts if any is missing. Netlify also needs `SECRETS_SCAN_ENABLED=false` (its scanner false-positives on server-side secrets; the Vercel deploy won't need this).
- **Database:** Neon Postgres, currently in `ap-southeast-1` (Singapore) — far from Dubai users; a near region / co-located compute is a v2/go-live perf fix. Already migrated + seeded.
- **Google OAuth:** Web client, consent screen Internal (`interestingtimes.me`). Redirect URIs: `https://ou7in17.netlify.app/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`.
- **SECURITY TODO:** the Neon connection string was shared in chat during setup — **rotate the Neon password** and update `DATABASE_URL`. Secrets live only in env, never committed.

## Integration status (PRD §14)
- **Entitlement numbers** — supplied + seeded (above). **Google OIDC** — done (test).
- **Notion export targets (Epic 13)** — created in the Agency Resources Hub (page `37a55e697f7780548c31f610c98e6e75`). DB IDs: Employee Summary `7008357d61cf40df87fee2e65baec2ca` · Leave Balances `ae6b612d15684350840ae11ab8be94d4` · Leave Records `8ea35943b3db4c3db997792978aae465` · Weekly Who's-Off `2ed55e697f7780dba03fd7a15c4c9880`. The app writes who's-off rows then sets **Status → "Notifying"** to trigger Notion's own notify automation. **Pending:** the Notion internal-integration secret + sharing the 4 DBs with it. Target DB IDs + property mapping must be **config, not hard-coded**.
- **Teams (Epic 11)** — Azure app / admin consent not yet done.

## Test coverage on hot paths (Epic 22.5)
- **Named hot-path coverage exists.** Allowance engine unit tests are **exhaustive** (`tests/unit/allowance.test.ts` + `tests/unit/allowance-exhaustive.test.ts`: pro-rata, carry-over cap/clamp/null-market, full Remaining ledger, `canBook` over-booking hard-block, half-days, non-carry Remote holiday bucket). The leave-request **zod** schema is unit-tested (`tests/unit/leave-schema.test.ts`). **request → approve → cancel** is covered **server-side in CI** by `tests/integration/request-approve-cancel.test.ts` (PENDING holds, APPROVE debits via `core/allowance`, CANCEL restores — incl. half-days + owner self-cancel). Playwright e2e specs cover SSO sign-in (`tests/e2e/sso.spec.ts`), request→approve→cancel (`request`/`approvals`/`cancellation`/`myleave-cancel`), and the wall chart (`wall-chart.spec.ts`).
- **Playwright-in-CI gap (tracked go-live follow-up).** `.github/workflows/ci.yml` runs `typecheck → lint → unit → migrate → integration → build`; the two e2e steps are **commented out** (`# - run: npx playwright install --with-deps chromium`, `# - run: npm run e2e`). **Enabling them is a one-line uncomment of each** — not yet done because committing a workflow change needs a `workflow`-scoped push token the build automation lacks. The server-side integration test above keeps the key hot path CI-covered in the meantime.

## Known issues / next-work notes
- **Perceived slowness on the test deploy** is mostly infra (Neon in Singapore + Netlify free-tier cold starts + no caching + all pages server-rendered) plus a few app-level query patterns (`getAllPeriodBalances` loops a query per period; some pages do sequential reads). Not representative of a tuned Vercel + near-region DB. A measured perf pass is part of v2.
- The Netlify secret scanner is disabled for the test; the cleaner fix is to read secrets at runtime in `lib/env` so they aren't baked into the build (optional, tidier for Vercel).

## Next work (priority order)
1. **v2 UX/performance/readiness pass** — scoped in `docs/V2-PRD.md` (epics 17–23), supported by `V2-UX-AUDIT.md`, `V2-UX-IDEAS-FROM-THE-FIELD.md`, `V2-PERFORMANCE-RENDERING.md`, `V2-APP-READINESS-FIXES.md`, and `STRUCTURE-SECURITY-HOSTING.md`. Build order: responsive shell + bottom tab bar → dashboard widget grid + consistency + accessibility → performance + readiness (incl. wall-chart deep rebuild). Work one story at a time per `EPICS.md`.

   **▶ Immediate input (next chat): Eddy's recorded UI/UX walkthrough.** He'll share a screen+voice video of the running app.
   - **Read order to start:** this file → `CLAUDE.md` (guardrails) → `docs/V2-PRD.md` → `docs/V2-UX-AUDIT.md` (finding IDs H/M/L the PRD references) → skim the other three v2 docs. Recalled memory `ou7-v2-ux-decisions` holds the four locked calls; `ou7-watch-skill-workflow` holds the video-processing mechanics.
   - **To process the video:** either run the `/watch` skill on the file Eddy drops in the folder (per `ou7-watch-skill-workflow`: reinstall `yt-dlp`, re-add the Groq key for the session, or use `--no-whisper` frames-only — the PII-safe path — paired with a NotebookLM transcript), **or** take the notes/transcript Eddy brings from his Mac's Claude Code `/watch`.
   - **Then:** fold the findings into `docs/V2-UX-AUDIT.md` (as new findings) and the affected `docs/V2-PRD.md` epics. **Do not start building until Eddy signs off** on the walkthrough-informed plan.
2. **Go-live (Epic 16.4/16.5)** — deploy + migrate WhosOff data (employees/balances/history/holidays); integrity report; reconcile ≥10; parallel-run one cycle; cut over; cancel WhosOff. **Hosting is being re-decided:** Eddy is weighing **Vercel + near-region Postgres** vs a **full-stack move to Google Cloud or AWS in a Gulf region** — see `docs/STRUCTURE-SECURITY-HOSTING.md`. The DB is currently Neon/Singapore (the main latency cause); any region/host change is a new ADR (hosting is ADR-0002). Pre-go-live security TODOs still stand: rotate the Neon password + Google OAuth secret, add security headers/CSP, add a `middleware.ts` auth backstop.
3. Notifications (Epic 11; needs Teams/Azure + email) · Remote holiday consumption (plan in `OVERNIGHT-NOTES.md`) · reports (E12) · Notion export + iCal (E13) · min-staffing (10.3) · Directory sync (2.1).

## Set up on a new machine
1. Get the code: `git clone https://github.com/adwinalias/ou7` (cleanest), or use the AirDropped folder — if AirDropped, delete `node_modules/` and reinstall.
2. `npm install` · `npm run db:generate`.
3. Create `.env` from `.env.example`; fill secrets (`DATABASE_URL`, `AUTH_URL=http://localhost:3000` for dev, `AUTH_SECRET` via `openssl rand -base64 32`, Google client id/secret, `ALLOWED_EMAIL_DOMAIN=interestingtimes.me`). **Never commit `.env`.**
4. DB: point `DATABASE_URL` at the Neon test DB, or run `docker compose up -d` for local Postgres; then `npm run db:migrate && npm run db:seed`.
5. `npm run dev` → http://localhost:3000 (the localhost redirect URI is already on the Google client).
6. Verify: `npm run typecheck && npm run lint && npm test && npm run build`.
- GitHub repo: `github.com/adwinalias/ou7`. CI merge gate: the `build-and-test` Actions job. `gh` CLI must be authenticated on the new machine to open/merge PRs.

## How to work (unchanged)
Guardrails in `CLAUDE.md` still hold (deterministic `core/`, standalone, Google SSO + server-side RBAC, region-aware, engine-computed balances, no overtime, design tokens / grey=pending, Asia/Dubai). Work `docs/EPICS.md` one story at a time, smallest useful slice, plan-first for anything non-trivial, tests with every change, one story ≈ one PR, all gates green before merge, ADR for significant decisions. **Merge each reviewed PR before building the next dependent thing** (we previously let work outrun merges and orphaned two PRs — avoid that).
