import { expect, type Page, test } from "@playwright/test";

const OWNER_EMAIL = "e2e-myleave@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("owner self-cancels an eligible request from My Leave (Epic 5.6 / 7.2)", async ({ page }) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto("/my-leave");
  await expect(page.getByRole("heading", { name: "My leave" })).toBeVisible();

  // The seeded future PENDING request shows a Cancel action.
  const row = page.locator("tr", { hasText: "2026-11-30" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Pending");
  await row.getByTestId("row-cancel").click();

  // After cancel the row reflects CANCELLED and the Cancel action is gone.
  const cancelledRow = page.locator("tr", { hasText: "2026-11-30" });
  await expect(cancelledRow).toContainText("Cancelled");
  await expect(cancelledRow.getByTestId("row-cancel")).toHaveCount(0);
});
