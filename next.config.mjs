/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output makes the Docker image (on-prem portability) small and self-contained.
  output: "standalone",
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
