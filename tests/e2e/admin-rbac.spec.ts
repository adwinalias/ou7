import { expect, type Page, test } from "@playwright/test";

// Defense-in-depth: HR admin pages must redirect a non-HR user (server actions are already
// 403-gated). The requester fixture is a STAFF employee.
const STAFF_EMAIL = "e2e-requester@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("a non-HR user is redirected away from /admin/allowance", async ({ page }) => {
  await signIn(page, STAFF_EMAIL);
  await page.goto("/admin/allowance");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("allowance-employee")).toHaveCount(0); // never rendered the HR page
});
