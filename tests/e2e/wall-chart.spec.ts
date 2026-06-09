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

test("wall chart groups and filters (Epic 6.2)", async ({ page }) => {
  await signIn(page, HR_EMAIL);

  // Group by department → a group header row appears (seeded users have no department).
  await page.goto("/wall-chart?y=2026&m=9&group=department");
  await expect(page.getByText("No department").first()).toBeVisible();

  // Filter by name narrows the chart to matching employees only.
  await page.goto("/wall-chart?y=2026&m=9&name=Wanda");
  await expect(page.getByText("Wanda Waller")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Adwin Alias");
});

test("wall chart exports CSV and offers a print view (Epic 6.4)", async ({ page }) => {
  await signIn(page, HR_EMAIL);

  // CSV reflects the requested month + filters and is downloadable.
  const res = await page.request.get("/wall-chart/export?y=2026&m=9&name=Wanda");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.text();
  expect(body.split("\r\n")[0]).toMatch(/^Employee,Department,Region,1,/);
  expect(body).toContain("Wanda Waller");
  expect(body).not.toContain("WALL-SECRET-NOTE");

  // Print control is present on the page.
  await page.goto("/wall-chart?y=2026&m=9");
  await expect(page.getByTestId("wc-print")).toBeVisible();
});
