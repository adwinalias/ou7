import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("approving a request records an audit event HR can view (Epic 16.1)", async ({ page }) => {
  await signIn(page, HR_EMAIL);

  // Approve the dedicated audit fixture request.
  await page.goto("/approvals");
  const card = page.getByTestId("approval-card").filter({ hasText: "AUDIT approve me" });
  await expect(card).toBeVisible();
  await card.getByTestId("approve").click();
  await expect(page.getByTestId("approval-card").filter({ hasText: "AUDIT approve me" })).toHaveCount(0);

  // The HR-only audit log shows the approval.
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByTestId("audit-table")).toBeVisible();
  await expect(page.getByText("LEAVE_APPROVE").first()).toBeVisible();
});
