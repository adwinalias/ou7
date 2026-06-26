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

test("admin config forms collapse to a single column on a phone (Epic 25.4)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/config");
  await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();

  // The reflow-1col class + the ≤640px !important rule force one column on phones.
  const form = page.locator("form.reflow-1col").first();
  await expect(form).toBeVisible();
  const tracks = await form.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length,
  );
  expect(tracks).toBe(1);

  // No page-level horizontal overflow.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
