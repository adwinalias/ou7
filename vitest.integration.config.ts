import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Integration tests hit a real Postgres (DATABASE_URL). Kept in a separate project so
// the default `npm test` (pure unit) needs no DB. Run with `npm run test:integration`;
// CI runs it after `prisma migrate deploy`. Locally the suite SKIPS itself if the DB is
// unreachable (see tests/integration/rbac.test.ts).
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globals: true,
    // Surface .env values (e.g. DATABASE_URL) on process.env before module env-validation
    // runs. In CI the real env vars are already set and missing .env files are a no-op.
    env: loadEnv("", process.cwd(), ""),
    // DB state is shared; avoid cross-file parallelism clobbering rows.
    fileParallelism: false,
  },
  resolve: {
    alias: [{ find: /^@\//, replacement: root }],
  },
});
