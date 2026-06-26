import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("the app shell shows a single accessible OU7 brand logo (Epic 17.5, L2)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/dashboard");

  // L2: exactly ONE node is announced to screen readers (replacing the old
  // CSS-toggled light/dark <img> pair). It carries role="img" + an accessible name.
  const logo = page.locator(".brand-logo [role='img']");
  await expect(logo).toHaveCount(1);
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAccessibleName(/OU7/);

  // The wordmark is enlarged (~2×): explicit 88px box (was 44px). Use ~80 as a floor.
  const box = await logo.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(80);

  // The old two-<img> lockup is gone.
  await expect(page.locator("img.logo-light, img.logo-dark")).toHaveCount(0);
});

test("the brand logo is visible on a phone viewport (Epic 17.5 — mobile)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  // The sidebar is hidden ≤640px, so the logo must live in the always-rendered header.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/dashboard");

  const logo = page.locator(".brand-logo [role='img']");
  await expect(logo).toHaveCount(1); // still exactly one logo node (L2)
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAccessibleName(/OU7/);
});

test("the app shell collapses to a single column with no overflow on a phone (Epic 25.1)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/dashboard");

  // The grid columns now live in CSS (not an inline style), so the ≤640px media query
  // collapses .app-shell to one track. Computed gridTemplateColumns must be a single
  // track (no leftover "220px ..." sidebar column).
  const tracks = await page.locator(".app-shell").evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length,
  );
  expect(tracks).toBe(1);

  // The desktop sidebar is hidden on phones.
  await expect(page.locator(".app-sidebar")).toBeHidden();

  // No horizontal overflow at 375px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
