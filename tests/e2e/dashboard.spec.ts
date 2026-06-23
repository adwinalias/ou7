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

  // 8.3 — request-leave widget launches the request flow.
  await page.getByTestId("dash-request").click();
  await expect(page).toHaveURL(/\/request$/);
  await expect(page.getByRole("heading", { name: "Request leave" })).toBeVisible();
});
