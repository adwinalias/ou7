import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("HR cancels a pending request from the company queue (Epic 5.6)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin/pending?name=Cancella");
  await expect(page.getByRole("heading", { name: "Company pending queue" })).toBeVisible();

  const row = page.getByTestId("pending-row").filter({ hasText: "Cancella Test" });
  await expect(row).toBeVisible();
  await row.getByTestId("pending-cancel").click();

  // After cancel, the (name-filtered) queue no longer lists the request.
  await expect(page.getByTestId("pending-row").filter({ hasText: "Cancella Test" })).toHaveCount(0);
});
