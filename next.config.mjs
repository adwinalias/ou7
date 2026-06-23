// Epic 22.4 — Content-Security-Policy + standard security headers, applied to ALL routes.
//
// IMPORTANT (static-render safety): these headers are STATIC strings — they read no
// per-request state — so emitting them via `async headers()` does NOT opt any route into
// dynamic rendering. The data-free public routes (/, /sign-in, /not-provisioned) stay
// statically rendered (Epic 21.1). We deliberately do NOT use a per-request CSP nonce: a
// nonce would have to be read from headers() inside the root layout, which would force every
// route dynamic and regress 21.1.
//
// `script-src` therefore allows 'unsafe-inline'. This is needed for the root layout's
// inline theme-init script (flash-free dark mode) and Next.js's own inline bootstrap, while
// keeping static rendering intact. GO-LIVE HARDENING FOLLOW-UP: tighten script-src to a
// per-script hash (the theme-init script is static, so its SHA-256 hash is stable and can be
// pinned) or move to a nonce only if/when the public routes no longer need to be static.
// HSTS is intentionally omitted here — it's a hosting/TLS concern (set at the edge/proxy).
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output makes the Docker image (on-prem portability) small and self-contained.
  output: "standalone",
  experimental: {
    typedRoutes: true,
    // Epic 22.1 — opt into app/global-not-found.tsx (experimental in Next 15.5):
    // a top-level 404 that renders its own <html>/<body> for URLs that never reach
    // a route layout. The conventional app/not-found.tsx still handles notFound().
    globalNotFound: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Bundle discipline (Epic 21.5). The analyzer is a DEV-only tool, gated behind the
// ANALYZE env so the normal build is completely unaffected (and `@next/bundle-analyzer`
// is never required unless explicitly requested). To inspect bundles:
//   ANALYZE=true npm run build
// The dynamic import keeps it out of the default build path entirely.
let config = nextConfig;
if (process.env.ANALYZE === "true") {
  const { default: withBundleAnalyzer } = await import("@next/bundle-analyzer");
  config = withBundleAnalyzer({ enabled: true })(nextConfig);
}

export default config;
