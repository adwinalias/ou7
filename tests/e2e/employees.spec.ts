import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("HR creates an employee; profile generation stops without a policy (Epic 9.1)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin/employees");
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();

  // Create a Remote-region employee (Remote has no entitlement policy — cleared in setup).
  await page.getByTestId("emp-email").fill("e2e-emp-staff@interestingtimes.me");
  await page.getByTestId("emp-first").fill("E2E");
  await page.getByTestId("emp-last").fill("Staff");
  await page.getByTestId("emp-region").selectOption({ label: "Remote" });
  await page.getByTestId("emp-joining").fill("2026-03-01");
  await page.getByTestId("emp-create").click();

  const row = page.locator("tr", { hasText: "e2e-emp-staff@interestingtimes.me" });
  await expect(row).toBeVisible();

  // Generating a profile must STOP and flag (no invented number).
  await row.getByTestId("gen-profile").click();
  await expect(row.getByTestId("gen-result")).toContainText(/no entitlement policy/i);
});
