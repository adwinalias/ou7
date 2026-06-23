import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("HR adds an adjustment and resets the opening (Epic 9.2)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin/allowance");
  await expect(page.getByRole("heading", { name: "Allowance management" })).toBeVisible();

  // Select the fixture employee and load it.
  await page.getByTestId("allowance-employee").selectOption({ label: "Allowy Manager" });
  await page.getByRole("button", { name: "View" }).click();
  await expect(page.getByTestId("bd-opening")).toHaveText("20");

  // Add a +2 adjustment (audited ledger).
  await page.getByTestId("entry-kind").selectOption("ADJUSTMENT");
  await page.getByTestId("entry-delta").fill("2");
  await page.getByTestId("entry-reason").fill("e2e grant");
  await page.getByTestId("entry-submit").click();
  await expect(page.getByTestId("ledger-table")).toContainText("e2e grant");

  // Reset preview (20 → 22, full-year UAE STAFF joiner) then apply.
  await expect(page.getByTestId("reset-from")).toHaveText("20");
  await expect(page.getByTestId("reset-to")).toContainText("22");
  await page.getByTestId("reset-confirm").click();
  await expect(page.getByTestId("bd-opening")).toHaveText("22");
});
