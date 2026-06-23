import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("dashboard shows allowance donut, next-7 strip, and request CTA (Epic 8)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "My Dashboard" })).toBeVisible();

  // 8.1 — allowance donut with all three arcs LABELLED (not colour-only).
  const allowance = page.locator("section").filter({ hasText: "Allowance this year" });
  await expect(allowance.getByText("Taken", { exact: true })).toBeVisible();
  await expect(allowance.getByText("Pending", { exact: true })).toBeVisible();
  await expect(allowance.getByText("Available", { exact: true })).toBeVisible();

  // 8.2 — next 7 days strip.
  await expect(page.getByTestId("next-7")).toBeVisible();

  // 18.7 — the request action now lives in the persistent app-shell header (it replaced
  // the old full-column dashboard tile) and opens the Request flow in a side-peek OVER
  // the current screen, with no navigation away from the dashboard.
  await page.getByTestId("dash-request").click();
  await expect(page).toHaveURL(/\/dashboard$/); // no navigation
  const peek = page.getByRole("dialog", { name: "Request leave" });
  await expect(peek).toBeVisible();
  await expect(peek.getByTestId("leave-type")).toBeVisible();
  // Escape closes the peek and returns focus to the trigger (Modal a11y mechanics).
  await page.keyboard.press("Escape");
  await expect(peek).not.toBeVisible();
});
