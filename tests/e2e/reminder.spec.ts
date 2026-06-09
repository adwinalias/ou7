import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("HR sends a reminder on a pending request (Epic 5.7)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  // Wanda's pending request stays pending (other specs only read it).
  await page.goto("/admin/pending?name=Wanda");
  const row = page.getByTestId("pending-row").filter({ hasText: "Wanda Waller" });
  await expect(row).toBeVisible();
  await row.getByTestId("pending-remind").click();
  await expect(row.getByTestId("remind-note")).toContainText(/reminder sent/i);
});
