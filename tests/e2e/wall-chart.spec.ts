import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";
const WALL_SECRET = "WALL-SECRET-NOTE"; // seeded note; must never render on the wall chart

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("wall chart renders leave, navigates months, and hides notes", async ({ page }) => {
  await signIn(page, HR_EMAIL);

  await page.goto("/wall-chart?y=2026&m=9");
  await expect(page.getByRole("heading", { name: "Team wall chart" })).toBeVisible();
  await expect(page.getByTestId("wc-month")).toHaveText("September 2026");

  // The seeded approved Vacation shows as a leave cell with its letter code.
  await expect(page.getByTestId("wall-chart")).toBeVisible();
  await expect(page.getByTestId("leave-cell").filter({ hasText: "V" }).first()).toBeVisible();

  // Privacy (6.5): the private note never reaches the client.
  await expect(page.locator("body")).not.toContainText(WALL_SECRET);

  // Navigation (6.3).
  await page.getByTestId("wc-next").click();
  await expect(page.getByTestId("wc-month")).toHaveText("October 2026");
  await page.getByTestId("wc-prev").click();
  await expect(page.getByTestId("wc-month")).toHaveText("September 2026");
});
