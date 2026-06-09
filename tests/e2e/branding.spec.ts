import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("the app shell shows the OU7 brand logo (light theme)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/dashboard");

  // Light theme is the default → the light-bg lockup is visible, the dark one hidden.
  await expect(page.locator("img.logo-light")).toBeVisible();
  await expect(page.locator("img.logo-light")).toHaveAttribute("src", "/brand/ou7-light-bg.png");
  await expect(page.locator("img.logo-dark")).toBeHidden();
});
