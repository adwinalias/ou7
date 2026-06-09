import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("HR adds a public holiday (Epic 10.1)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin/calendars?year=2026");
  await expect(page.getByRole("heading", { name: "Regional calendars" })).toBeVisible();

  await page.getByTestId("holiday-date").fill("2026-12-25");
  await page.getByTestId("holiday-name").fill("E2E Holiday");
  await page.getByTestId("add-holiday").click();

  await expect(page.getByTestId("holiday-table")).toContainText("E2E Holiday");
});

test("HR adds a restricted/blackout day (Epic 10.2)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin/restricted-days");
  await expect(page.getByRole("heading", { name: "Restricted / blackout days" })).toBeVisible();

  await page.getByTestId("r-start").fill("2026-12-20");
  await page.getByTestId("r-end").fill("2026-12-21");
  await page.getByTestId("r-reason").fill("E2E Freeze");
  await page.getByTestId("add-restricted").click();

  await expect(page.getByTestId("restricted-table")).toContainText("E2E Freeze");
});
