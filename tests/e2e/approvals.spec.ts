import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

// Sign in via the test-only credentials provider (E2E_TEST_LOGIN=1).
async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test.describe.configure({ mode: "serial" }); // share the seeded queue; act in order

test("HR approves a pending request", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/approvals");
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();

  const card = page.getByTestId("approval-card").filter({ hasText: "E2E approve me" });
  await expect(card).toBeVisible();
  await card.getByTestId("approve").click();

  // Decided request drops out of the queue.
  await expect(page.getByTestId("approval-card").filter({ hasText: "E2E approve me" })).toHaveCount(0);
});

test("HR must give a reason to decline", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/approvals");

  const card = page.getByTestId("approval-card").filter({ hasText: "E2E decline me" });
  await expect(card).toBeVisible();

  // Declining with no reason is blocked inline.
  await card.getByTestId("decline").click();
  await expect(card.getByRole("alert")).toContainText(/reason is required/i);

  // With a reason it goes through and the card clears.
  await card.getByTestId("decision-comment").fill("Team is short-staffed that week.");
  await card.getByTestId("decline").click();
  await expect(page.getByTestId("approval-card").filter({ hasText: "E2E decline me" })).toHaveCount(0);
});
