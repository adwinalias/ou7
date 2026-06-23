// Edge auth backstop (Epic 21.1). An ADDITIONAL gate in front of the app, NOT a
// replacement for the server-side guards: the central RBAC check (lib/rbac
// `requireUser`/`requireActor`) and every server action still authorize on the server with
// fresh DB authority. This middleware only answers the cheap edge question "is there a valid
// NextAuth session token?" and, if not, redirects to the sign-in flow.
//
// Why a matcher of ONLY the protected (app) prefixes (instead of gating everything and
// excluding the public ones): it keeps the data-free routes — `/`, `/sign-in`,
// `/not-provisioned`, `/api/auth/*`, `/api/health`, Next internals and static assets like
// `/icon.png` — entirely outside the middleware, so they stay STATICALLY rendered (○) and
// publicly reachable, while the (app) routes remain dynamic (ƒ) and now also redirect
// unauthenticated users at the edge.
//
// Session strategy is JWT (see lib/auth.ts), so `withAuth` reads the JWT at the edge — no DB
// on the edge. The domain restriction is already enforced at sign-in (the `signIn` callback +
// Google `hd` param), so a token only ever exists for an in-domain account. Provisioning /
// role / status are resolved later by `requireUser`, deliberately NOT here (no DB on the edge).
//
// The test Credentials-provider sign-in (E2E) issues the same JWT, so the e2e flows that sign
// in through the app pass straight through; only token-less requests are redirected.
import { withAuth } from "next-auth/middleware";

export default withAuth({
  // `AUTH_SECRET` is the canonical var (lib/env). The env bridge that aliases it to
  // NEXTAUTH_SECRET runs in the Node runtime, not on the edge, so pass it explicitly.
  secret: process.env.AUTH_SECRET,
  pages: { signIn: "/sign-in" },
  // Default `authorized` => `!!token`: with no valid token, withAuth redirects to
  // `/sign-in?callbackUrl=<original>`, matching the existing server-side redirect target.
});

export const config = {
  // Gate ONLY the protected (app) routes (and anything nested under them). Everything else —
  // public/data-free routes, `/api/auth/*`, `/api/health`, `/_next/*`, static files — is not
  // matched and therefore untouched (stays static / public).
  // Each prefix is listed twice — the bare path (`/dashboard`) and the subtree
  // (`/dashboard/:path*`) — because Next's path-to-regexp matcher treats `:path*` as a
  // required following segment, so `/dashboard/:path*` alone would NOT match `/dashboard`.
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/wall-chart",
    "/wall-chart/:path*",
    "/my-leave",
    "/my-leave/:path*",
    "/request",
    "/request/:path*",
    "/approvals",
    "/approvals/:path*",
    "/admin",
    "/admin/:path*",
  ],
};
