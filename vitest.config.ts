import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve the project root via fileURLToPath so paths with spaces (e.g. the dev
// folder name) are decoded correctly — `.pathname` would leave "%20" in the path.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    // Unit tests target the pure domain layer in core/. Fast, no DB, no network.
    include: ["tests/unit/**/*.test.ts", "core/**/*.test.ts"],
    environment: "node",
    globals: true,
  },
  resolve: {
    // Map "@/..." (e.g. @/core/leave) onto the project root, mirroring tsconfig paths.
    alias: [
      { find: /^@\//, replacement: root },
      // `server-only` throws outside an RSC build; alias it to a no-op so any test that
      // (transitively) imports a server-only module collects without throwing.
      { find: /^server-only$/, replacement: `${root}tests/stubs/server-only.ts` },
    ],
  },
});
