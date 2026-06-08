import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests target the pure domain layer in core/. Fast, no DB, no network.
    include: ["tests/unit/**/*.test.ts", "core/**/*.test.ts"],
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@/core": new URL("./core", import.meta.url).pathname,
      "@/lib": new URL("./lib", import.meta.url).pathname,
    },
  },
});
