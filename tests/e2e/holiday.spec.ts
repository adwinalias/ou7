import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("HR sets a Remote employee's Holiday balance (v2b)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin/allowance");

  await page.getByTestId("allowance-employee").selectOption({ label: "Remy Remote" });
  await page.getByRole("button", { name: "View" }).click();

  const section = page.getByTestId("holiday-section");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("holiday-days")).toHaveText("5"); // default

  await page.getByTestId("holiday-input").fill("7");
  await page.getByTestId("holiday-save").click();
  await expect(page.getByTestId("holiday-days")).toHaveText("7");
});
