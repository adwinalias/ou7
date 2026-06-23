# OU7 — How it works, security review & where to host

Plain-language explainer of the current build (what runs where), a prioritized security review, and a hosting recommendation. Reflects the code on `main` as of 2026-06-18.

---

## 1. How it's set up today

OU7 is one **Next.js** app with a clean split into three layers. The golden rule in the code is a one-way dependency: **browser → server → database**, and the pure business logic (`core/`) depends on nothing.

```
┌────────────────────────────────────────────────────────────────────┐
│ FRONTEND — the browser (what the user sees)                          │
│   React pages (mostly server-rendered HTML) + a few interactive      │
│   "client" pieces (forms, buttons, theme toggle).                    │
│   Holds NO secrets and NO business logic. Just shows data and        │
│   sends requests.                                                    │
└───────────────┬──────────────────────────────────────────────────────┘
                │  HTTPS (sign-in cookie)
                ▼
┌────────────────────────────────────────────────────────────────────┐
│ BACKEND — the server (runs on Vercel)                                │
│   • Server Actions (11 files, e.g. request/approvals/admin) =        │
│     the buttons that change data; run only on the server.            │
│   • A few API routes: Google sign-in, /health, CSV export.           │
│   • lib/  = all the input/output (database, auth, audit, email).     │
│   • core/ = pure rules: allowance maths, working-day counting,       │
│     approval state machine. No database, no secrets, fully tested.   │
│   This is where authorization is checked and secrets live.           │
└───────────────┬──────────────────────────────────────────────────────┘
                │  Prisma (parameterised SQL)
                ▼
┌────────────────────────────────────────────────────────────────────┐
│ DATABASE — managed PostgreSQL (today: Neon, Singapore)               │
│   Employees + personal info, leave requests, the allowance ledger,   │
│   holidays/regions, notifications, and an immutable audit log.       │
│   Balances are COMPUTED by core/, never stored as a single number.   │
└────────────────────────────────────────────────────────────────────┘

Outbound only (never read back): Email, Teams, Notion export, iCal.
```

### What lives where

**Frontend (browser).** React + Tailwind. Most pages are **Server Components** — the HTML is built on the server and sent down, so very little code and **no secrets** ever reach the browser. Only small "client" components (the request form, buttons, the light/dark toggle) run JavaScript in the browser. The browser only ever *displays* data and *asks* the server to do things; it never talks to the database directly.

**Backend (server, on Vercel).** This is where everything important happens:
- **Server Actions** (`app/**/actions.ts`) are the write operations — submit a request, approve, cancel, all the HR/admin edits. They run on the server only.
- **API routes** are few: Google sign-in (`/api/auth/...`), a `/health` check, and the wall-chart CSV export.
- **`lib/`** is the plumbing: the database client (`db.ts`), authentication (`auth.ts`), the permission guard (`rbac.ts`), env-var validation (`env.ts`), the audit log, and the email/Teams adapters.
- **`core/`** is the brain: the allowance engine, calendar/working-day maths, the approval rules. It's pure, deterministic, and has no idea the database or the web exist — which is exactly what makes the app portable to another host later.

**Database (PostgreSQL).** Standard relational tables: people (with personal data — names, emails, phone, photo, Google ID), departments/regions, leave types, **allowance periods + an append-only adjustments ledger**, leave requests (including free-text notes and a supporting-document link), holidays, notifications, reports, and an **immutable audit trail** of every admin/approval action. Crucially, **balances are calculated on the fly** from the ledger, never hand-stored — so they can't silently drift.

### How a few things actually flow

- **Signing in:** Google SSO. The server only lets in `@interestingtimes.me` accounts (checked server-side, plus Google's domain hint), matches the email to an existing employee (no self-registration), and issues an 8-hour session cookie. Your *role* (Staff / Approver / HR) is looked up **fresh from the database on every request**, so an HR change takes effect immediately.
- **Booking leave:** the form previews the impact using `core/` (working days, over-booking check), then a Server Action saves it as *Pending* and notifies the approver.
- **Approving:** an approver action runs the rules in `core/approvals`, writes the decision, debits the allowance via `core/allowance`, and records an audit event.

---

## 2. Security review (prioritized)

### Already solid (good foundations)
- **Authorization is server-side and per-request.** One central guard (`lib/rbac`) resolves your role/permissions from the database on every call; pages redirect and actions return 403 when you're not allowed. The rules themselves are pure functions in `core/authz`.
- **The browser never touches the database.** All access goes through the server — so the most common "vibe-coded app" breach (misconfigured row-level security letting the browser read the whole database) **cannot happen here by design**.
- **Domain-locked Google SSO, no self-registration**, 8-hour sessions, identity-conflict protection.
- **Parameterised queries** (Prisma) — no SQL injection; **env vars validated at boot** (fails loudly, never prints secret values); **immutable audit log**; React escapes output by default.

### Fix before go-live
1. **Rotate the leaked secrets.** The Neon database password and Google OAuth secret were shared in chat during setup. Until they're rotated, anyone who saw them could connect. (Already on the to-do list — do it.)
2. **Add security headers + a Content-Security-Policy.** `next.config.mjs` currently sets none. Add CSP, clickjacking protection (`frame-ancestors`/X-Frame-Options), `X-Content-Type-Options`, `Referrer-Policy`, and HSTS. The architecture doc *describes* these but they aren't implemented yet.
3. **Add a `middleware.ts` auth backstop.** Today every page/action is protected *because the developer remembered to call the guard*. That's well done so far, but there's no blanket gate — one forgotten guard on a future route = an exposed route. A middleware check is cheap defence-in-depth (and also speeds up rendering — see the performance doc).
4. **Decide on MFA.** The data model has an `mfaEnabled` flag but there's no TOTP flow built. For an HR tool holding everyone's personal data, consider requiring MFA at least for the HR role (this is Epic 1.6). Today account security leans entirely on Google — fine if Workspace enforces 2-factor, worth confirming.

### Worth doing (medium)
5. **Rate limiting** on sign-in and request/mutation endpoints — described in the architecture but not built. Lower risk because every user is already an SSO-verified employee, but it stops runaway/abuse.
6. **Validate the free-text inputs server-side.** Confirm every Server Action validates its input with Zod (the project already uses Zod). The two user-content fields to watch are the request **notes** and the **Supporting document URL** — validate the URL is a real `https://` link, and render any saved link with `rel="noopener noreferrer"`.
7. **Use a pooled database connection on serverless.** Vercel runs many short-lived function instances; without a pooled connection string (Neon's pooler / PgBouncer, or equivalent) you can exhaust the database's connections under load. Set the pooled `DATABASE_URL` for the deployed app.
8. **Make sure the test-login is never enabled in production.** There's a Playwright-only credentials login gated by `E2E_TEST_LOGIN`. It's domain-restricted even if on, but that env flag must never be set on the production deploy.
9. **Attachments in private storage.** Supporting documents should live in an access-controlled (HR-only) store with the planned 2-year auto-purge — not a public bucket. Verify this when the upload path is built (today it's a pasted link).

### Hygiene
- Keep dependencies patched (`npm audit`); Next.js, Prisma and Auth.js especially.
- Keep the audit log strictly append-only (no edit/delete paths).
- On Vercel, keep secrets as runtime env (don't carry over the Netlify "disable secret scanning" workaround).

---

## 3. Where to host

**The single biggest issue today is location, not platform.** The app is on a Netlify test deploy and the database is **Neon in Singapore** — far from Dubai users — which is the main cause of the perceived slowness. Production is meant to be **Vercel** (ADR-0002). Here's the current lay of the land (June 2026):

- **Neon** (current DB host): **no Middle East and no India region** — the nearest is Singapore. So staying on Neon keeps the latency problem.
- **Supabase:** has a **Mumbai** region (much closer to Dubai than Singapore) but **no Middle East** region.
- **Vercel:** now has a **Dubai region (`dxb1`)** you can pin functions to.
- **AWS:** has a **UAE region (`me-central-1`)** and **Bahrain (`me-south-1`)** with managed Postgres (RDS/Aurora) — data stays in-region.
- **Google Cloud:** has **Doha** and **Dammam** regions with Cloud SQL Postgres — and you're already a Google Workspace shop.

### Recommendation

**Option 1 — Vercel + a near-region Postgres (recommended for go-live; lowest effort, biggest speed win).**
Keep the app on Vercel (already paid, best Next.js support, and you can pin functions to the **Dubai `dxb1`** region). Move the **database off Neon-Singapore** to something near the Gulf:
- **AWS RDS Postgres in `me-central-1` (UAE)** or `me-south-1` (Bahrain) — best latency, and personal data stays in-region; or
- **Supabase Postgres in Mumbai** — simplest to set up and still a big improvement over Singapore.
Add private object storage (S3 or Supabase Storage) for attachments and Workspace SMTP / SES for email. This keeps the app's "standalone & portable" promise (still plain Postgres + the existing Docker image).

**Option 2 — Full-stack on one cloud (best for data residency / single owner; more ops).**
The app is already containerised (`output: standalone` + a `Dockerfile`), so moving the whole thing in-region later is low-risk:
- **Google Cloud — Cloud Run (container) + Cloud SQL Postgres in Doha/Dammam.** Natural fit since your identity is already Google, low-ops for containers, one vendor.
- **AWS — App Runner/Fargate + RDS in `me-central-1` + S3 + SES.** Maximum control and UAE residency.
Choose this if compliance requires personal data to stay in the UAE/Gulf, or you want everything under one provider.

**What I'd avoid:**
- **Don't adopt "full Supabase" (its Auth + row-level-security + browser-to-database model).** OU7's security is built the safer way — the browser never touches the database and the server checks every permission — so Supabase's headline features would fight that design (and the RLS-misconfiguration risk that breaks many apps doesn't even apply to yours). If you pick Supabase, use it **only as a managed Postgres/Storage box**.
- **Don't keep Neon-Singapore for production** — it has no nearby region.

**Resilience note:** Middle East cloud regions (including Vercel's Dubai region and AWS UAE) saw service disruptions during 2026. Whatever you choose, keep **automated database backups** and a tested restore (and ideally a cross-region replica) so a single-region outage isn't a data-loss event.

Hosting is governed by **ADR-0002 (Vercel)**; any move of the database region or a full-stack relocation should be recorded as a **new ADR**.

---

### Sources (region availability, June 2026)
- Neon regions — https://neon.com/docs/introduction/regions
- Supabase regions — https://supabase.com/docs/guides/platform/regions
- Vercel Dubai region (dxb1) — https://vercel.com/changelog/introducing-the-dubai-vercel-region-dxb1
- AWS UAE region (me-central-1) — https://aws.amazon.com/blogs/aws/now-open-aws-region-in-the-united-arab-emirates-uae/
- Google Cloud SQL region availability — https://docs.cloud.google.com/sql/docs/postgres/region-availability-overview
