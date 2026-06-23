import { expect, type Page, test } from "@playwright/test";

const E2E_EMAIL = "adwin.alias@interestingtimes.me";
const WEEKDAY = "2026-07-06"; // a Monday (UAE weekend = Fri/Sat… here Sat/Sun), a working day

// Sign in via the test-only credentials provider (E2E_TEST_LOGIN=1). Uses the browser
// context's cookie jar so the subsequent navigation is authenticated.
async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("request → live impact → submit books a pending leave (happy path)", async ({ page }) => {
  await signIn(page, E2E_EMAIL);

  await page.goto("/request");
  await expect(page.getByRole("heading", { name: "Request leave" })).toBeVisible();

  // 1 — details. No leave type is pre-selected; pick one explicitly.
  await page.getByTestId("leave-type").selectOption({ label: "Vacation" });
  await page.getByTestId("start-date").fill(WEEKDAY);

  // 2 — live impact panel auto-updates (debounced) — no "Check details" click.
  const preview = page.getByTestId("preview");
  await expect(preview).toBeVisible();
  await expect(page.getByTestId("working-days")).toHaveText("1");
  await expect(preview.getByText(/will be removed on approval/i)).toBeVisible();

  // 3 — submit → pending
  await page.getByTestId("submit-request").click();
  const success = page.getByTestId("submit-success");
  await expect(success).toBeVisible();
  await expect(success.getByText("Pending", { exact: true })).toBeVisible();
});
