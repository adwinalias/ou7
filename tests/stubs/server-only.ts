// Test-only no-op stub for the `server-only` package.
// `server-only` has a `react-server` export condition that resolves to an empty module
// in an RSC build, but throws otherwise. Vitest does not set that condition, so importing
// the real package at test-collection time throws "This module cannot be imported from a
// Client Component module." We alias it to this no-op in the Vitest configs so server-only
// lib modules can be imported by unit/integration tests. The real build-time guard (which
// keeps these modules out of the client bundle) is unaffected — Next's bundler still uses
// the real package.
export {};
