import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

// Epic 19.3a — Admin is one console with a System ⇄ Employee mode toggle (segments, not
// navigate-away buttons). System mode shows the system sections inline; Employee mode
// shows the staff list. No internal/developer jargon in the copy.
test("Admin console toggles between System and Employee modes inline (Epic 19.3a)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin");

  // Default mode = system: the segment is active and the system sections render inline.
  await expect(page.getByTestId("admin-mode-system")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("admin-system")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Regional calendars" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Restricted / blackout days" })).toBeVisible();

  // No leaked internal jargon anywhere in the console copy.
  await expect(page.locator("body")).not.toContainText(/EPIC/i);

  // Switch to Employee mode via the segment (stays on /admin, no sub-route navigation).
  await page.getByTestId("admin-mode-employee").click();
  await expect(page).toHaveURL(/\/admin\?mode=employee$/);
  await expect(page.getByTestId("admin-mode-employee")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("admin-employee")).toBeVisible();
  await expect(page.getByTestId("employee-table")).toBeVisible();
  await expect(page.getByTestId("employee-detail-hint")).toBeVisible();
  // The system sections are not rendered in employee mode.
  await expect(page.getByTestId("admin-system")).toHaveCount(0);
});

test("a non-HR user is redirected away from the Admin console (Epic 19.3a)", async ({ page }) => {
  await signIn(page, "e2e-requester@interestingtimes.me");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("admin-mode-system")).toHaveCount(0);
});
