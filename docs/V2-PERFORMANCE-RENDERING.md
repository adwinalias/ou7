# OU7 — v2 Performance & Rendering

Front-end performance and Next.js rendering work for v2 (Next.js 15 + React 19, Prisma/Postgres, Google SSO, Vercel target).

## Already correct — don't regress

- **Server Components first.** Pages are Server Components; interactivity is isolated to small `"use client"` components (sign-out, print, the request/approval/admin forms). Keep it that way.
- **Lean bundle.** No heavy date or charting library (no `moment`/`date-fns`/`dayjs`). Keep using native `Intl` for date/number formatting; don't add heavy deps when v2 adds charts/date pickers.
- **Server-side authorization** on every action.

## Fixes

**P1 — Add `middleware.ts` for the SSO gate.** There is no `middleware.ts` today, so the session is checked in a server layout, which forces every child route into dynamic rendering. Authenticate in middleware (domain-restricted SSO) so data-free routes stay static.

**P1 — Stream the dashboard: one Suspense boundary per widget.** No Suspense/`loading.tsx` exists yet, so the dashboard waits on its slowest query. Render the shell + tab bar instantly and wrap each widget (allowance, who's-off, pending approvals…) in its own `<Suspense>` with a skeleton (the design system's §10 loading state). Fits the customizable widget grid directly.

**P1 — Virtualise the wall chart.** Employees × ~31 days is a heavy grid; there's no virtualization library in the repo. Window/virtualise rows so only on-screen cells render; lazy-load off-screen content; keep day cells ≥ tap size.

**P1 — Put Core Web Vitals targets in the Definition of Done.** LCP ≤ 2.5s, INP/FID ≤ 100ms, low CLS. Measure with Lighthouse (incognito), the Web Vitals Chrome extension, `useReportWebVitals`, and Unlighthouse across every route before go-live.

**P2 — Guard Cumulative Layout Shift.** Set explicit `width`/`height` (or `aspect-ratio`) on the allowance donut, avatar, and logo, and size each widget skeleton to match its loaded content so tiles don't jump. (Also fixes audit L1.)

**P2 — Bundle discipline as features grow (done — Epic 21.5).** `@next/bundle-analyzer` is in the toolchain as a **dev-only** dependency, **gated behind the `ANALYZE` env** so the normal build is unaffected (it's dynamically imported in `next.config.mjs` only when `ANALYZE=true`). To inspect bundles and catch large dependencies:

```bash
ANALYZE=true npm run build   # opens the treemap report(s)
```

Prefer native/light options over libraries for simple formatting and charts. The app uses **native `Intl`/`Date`** for all date/number formatting and a **pure-SVG donut** for charting — no `moment`/`dayjs`/`date-fns`/`lodash` (verified absent; none must be added). New heavy deps should be justified against an analyzer run.

**CLS guards (done — Epic 21.5).** Explicit dimensions are set on every loaded element that could otherwise shift: the allowance **donut** SVG carries `width`/`height` (140×140 px, not just a `viewBox`) and its row reserves that height; the brand **logo** (`.brand-mark`) is a fixed 88×88 px; the theme-switch icons are 20×20 px; and each widget **skeleton** is sized to its content (`WidgetSkeleton`). There are no `<img>`/`next/image`/avatar elements on the dashboard. Result: no visible layout shift on dashboard load.

**CWV measurement (done — Epic 21.4).** `components/WebVitals.tsx` mounts `useReportWebVitals` once in the root layout to surface LCP/INP/CLS/FCP/TTFB in the browser console during development. It **never transmits metrics off-device** (dev-only `console.debug`, prod no-op) — standalone, no external runtime deps. Targets and the pre-go-live Unlighthouse run are recorded in the DoD (`PROJECT-PLAN.md` §6).
