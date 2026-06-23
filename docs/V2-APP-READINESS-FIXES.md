# OU7 — v2 App Readiness (accessibility, errors, testing, data, security)

App-level correctness work for v2, beyond UI/UX and performance. (Performance/rendering is in `V2-PERFORMANCE-RENDERING.md`; build order is in `V2-UX-AUDIT.md`.)

## A. Accessibility

The design system mandates WCAG AA but nothing enforces it. Concrete requirements:

- **Wall chart / calendar must be a semantic ARIA grid**, not styled `div`s: roles `grid` / `rowgroup` / `row` / `columnheader` / `rowheader` / `gridcell`, with `aria-colcount`/`aria-rowcount` and `aria-colindex`/`aria-rowindex`, and roving focus via `aria-activedescendant` (APG **Grid** pattern). Largest single a11y task.
- **Request form:** a real label on every input; custom selects use `combobox`/`listbox`/`option`; validation announced via `aria-required` / `aria-invalid` / `aria-errormessage`; date picker per the APG date-picker pattern.
- **Modals:** `role="dialog"` (or `alertdialog`) + `aria-modal`, focus trapped while open, focus returned to the trigger on close.
- **Navigation:** wrap in a `navigation` landmark; the bottom tab bar needs proper roles and ≥40px targets.
- **Status pills:** never colour alone — colour + letter/label (design system already does this); announce dynamic changes via `role="status"` / `aria-live`.
- **Tabs** (if widgets use them): `tablist` / `tab` / `tabpanel` + `aria-selected`.
- **Enforce it:** enable `eslint-plugin-jsx-a11y`; add an automated checker (e.g. AccessLint) in CI; test keyboard-only and with colour-blind/low-vision simulation. For exact keystroke behaviour, follow the relevant APG pattern page.

## B. Error handling (App Router)

- Add **`error.tsx`** boundaries per route segment (dashboard, wall-chart, approvals…) for localised fallback UI instead of a crashed tree.
- Add **`app/global-error.tsx`** (declares its own `<html>`/`<body>`) for root-layout failures, and **`not-found.tsx`** + `notFound()` (plus `global-not-found.tsx`) for 404s.
- **Expected errors** (form validation, failed requests): model as **return values via `useActionState`**, not thrown `try/catch` — applies to the Request and admin forms.
- Error boundaries don't catch event-handler/async errors — handle those manually with state.

## C. Production checklist (security)

- Verify authn/authz **inside every Server Action** and a server-only **Data Access Layer** (not just layout/middleware checks) — matches OU7's guardrail.
- **Taint** sensitive data so it can't leak to the client; keep `.env.*` git-ignored; add a **Content Security Policy**.
- Run `next build` then `next start` locally before prod to catch build errors and measure.

## D. Testing

- **Vitest (unit):** the `core/allowance` engine and other `core/` logic, `zod` schemas, synchronous components.
- **Playwright (E2E):** the hot paths — SSO sign-in, request → approve → cancel, wall chart — and async Server Components (which Vitest can't render).
- Both tools are already in the DoD; the work is real coverage on those flows.

## E. Database / query efficiency

- The wall chart (**employees × days**) is the textbook **N+1** risk. Load it with Prisma's **`relationLoadStrategy: "join"`** (one query), or `include` (nested read, two queries), or an **`in`** filter for ID lists — never a query per employee in a loop.
- Use **bulk ops** (`createMany`/`updateMany`) for batch work (employee import, seeding).
- Keep a **single `PrismaClient`** in `lib/db.ts` (already done) to avoid connection-pool exhaustion on Vercel serverless.
- Watch for missing indexes / over-fetching; trace slow queries (Prisma Query Insights / sqlcommenter).

## Net-new items for the add-on PRD

Route-level `error.tsx` + `global-error` + `not-found`; a Content Security Policy; `eslint-plugin-jsx-a11y` + AccessLint in CI; `@next/bundle-analyzer`; the Prisma `join` strategy on the wall chart; and Core Web Vitals targets in the Definition of Done.
