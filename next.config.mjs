/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output makes the Docker image (on-prem portability) small and self-contained.
  output: "standalone",
  experimental: {
    typedRoutes: true,
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
