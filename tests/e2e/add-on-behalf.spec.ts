import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("HR adds leave on behalf of an employee (Epic 9.3)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin/add-leave");
  await expect(page.getByRole("heading", { name: "Add leave on behalf" })).toBeVisible();

  // Target the seeded requester (their leave is reset each run) on a free weekday.
  await page.getByTestId("ob-employee").selectOption({ label: "Ess Requester" });
  await page.getByTestId("ob-type").selectOption({ label: "Vacation" });
  await page.getByTestId("ob-start").fill("2026-09-21");
  await page.getByTestId("ob-submit").click();

  await expect(page.getByTestId("ob-result")).toContainText(/pending/i);
});
