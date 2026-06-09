import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("HR adds a private OOO/WFH log (Epic 9.4)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin/hr-logs");
  await expect(page.getByRole("heading", { name: "HR logs (OOO / WFH)" })).toBeVisible();

  await page.getByTestId("log-type").selectOption("WFH");
  await page.getByTestId("log-start").fill("2026-08-03");
  await page.getByTestId("log-end").fill("2026-08-03");
  await page.getByTestId("log-notes").fill("E2E remote day");
  await page.getByTestId("log-submit").click();

  await expect(page.getByTestId("hrlog-table")).toContainText("Working from home");
});
