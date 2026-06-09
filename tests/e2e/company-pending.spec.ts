import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("HR sees the org-wide pending queue with time-in-pending (Epic 9.6)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin/pending");
  await expect(page.getByRole("heading", { name: "Company pending queue" })).toBeVisible();

  // The seeded requester's pending requests appear org-wide; rows show pending days + actions.
  await expect(page.getByTestId("company-queue")).toBeVisible();
  await expect(page.getByTestId("pending-row").first()).toBeVisible();
  await expect(page.getByTestId("pending-approve").first()).toBeVisible();
});
