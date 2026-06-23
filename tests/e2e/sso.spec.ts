import { expect, type Page, test } from "@playwright/test";

// Epic 22.5 — the SSO sign-in hot path. Two halves of the auth gate:
//  1) an UNAUTHENTICATED visit to a protected (app) route is bounced to the sign-in flow at
//     the edge (middleware.ts), preserving the original target as callbackUrl;
//  2) the sign-in page renders the Google SSO entry point (domain-restricted Workspace SSO —
//     the only way in; no self-registration).
// The other specs prove the authenticated path (they sign in via the E2E credentials
// provider, which issues the SAME JWT) — this spec proves the gate itself.

const E2E_EMAIL = "adwin.alias@interestingtimes.me";
const PROTECTED = "/dashboard";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("unauthenticated visit to a protected route redirects to sign-in (with callbackUrl)", async ({ page }) => {
  await page.goto(PROTECTED);
  await expect(page).toHaveURL(/\/sign-in/);
  // The original target is preserved so the user lands where they intended after SSO.
  expect(decodeURIComponent(page.url())).toContain(PROTECTED);
});

test("the sign-in page offers Google Workspace SSO", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: /time off, made simple/i })).toBeVisible();
  await expect(page.getByText(/Interesting Times Google account/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
});

test("after signing in, a protected route is reachable (no redirect)", async ({ page }) => {
  await signIn(page, E2E_EMAIL);
  await page.goto(PROTECTED);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page).not.toHaveURL(/\/sign-in/);
});
