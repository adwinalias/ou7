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
