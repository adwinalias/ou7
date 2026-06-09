import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("HR sets an entitlement policy (Epic 9.5)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin/config");
  await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();

  // Enter an HR-approved annual entitlement (upsert — re-runnable).
  await page.getByTestId("policy-role").selectOption("STAFF");
  await page.getByTestId("policy-annual").fill("25");
  await page.getByTestId("save-policy").click();

  await expect(page.getByTestId("policy-table")).toContainText("25");
});
