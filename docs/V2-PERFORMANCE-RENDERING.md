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

**P2 — Bundle discipline as features grow.** Use `@next/bundle-analyzer` to catch large dependencies; prefer native/light options over libraries for simple formatting and charts.
