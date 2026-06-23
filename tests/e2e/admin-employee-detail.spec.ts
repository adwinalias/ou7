import { expect, type Page, test } from "@playwright/test";

const HR_EMAIL = "adwin.alias@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

// Epic 19.3b — Employee-mode detail (AD6/AD7) + change-safety (AD8). Selecting a person
// opens their record inline on the same /admin page (no navigate-away), shows the editable
// fields incl. department plus their allowance, pending queue and add-leave-on-behalf;
// sensitive edits (region/department/approver level) require an explicit confirm step.
test("HR opens an employee inline, edits a non-sensitive field, and confirms a sensitive one (Epic 19.3b)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin?mode=employee");

  // Select the seeded allowance employee from the staff list.
  const row = page.locator("tr", { hasText: "Allowy Manager" });
  await row.getByRole("link", { name: /Manage|Selected/ }).click();

  // Stays on /admin with adminEmployee set; the inline detail renders below the list.
  await expect(page).toHaveURL(/\/admin\?mode=employee&adminEmployee=/);
  await expect(page.getByTestId("employee-detail-panel")).toBeVisible();
  await expect(page.getByTestId("employee-detail")).toBeVisible();
  await expect(page.getByTestId("ed-email")).toBeDisabled();

  // The composed surfaces are present.
  await expect(page.getByTestId("allowance-balance")).toBeVisible();
  await expect(page.getByTestId("employee-pending")).toBeVisible();
  await expect(page.getByTestId("employee-add-leave")).toBeVisible();

  // Non-sensitive edit (last name) saves without a confirm step.
  await page.getByTestId("ed-last").fill("Manager2");
  await page.getByTestId("ed-save").click();
  await expect(page.getByTestId("ed-result")).toContainText(/saved/i);

  // Sensitive edit (approver level) requires the confirm step listing what changes.
  await page.getByTestId("ed-level").selectOption("APPROVER");
  await page.getByTestId("ed-save").click();
  await expect(page.getByTestId("ed-confirm")).toBeVisible();
  await expect(page.getByTestId("ed-confirm-list")).toContainText("Approver level");

  // Cancel keeps it un-applied; re-open and confirm applies it.
  await page.getByTestId("ed-confirm-cancel").click();
  await expect(page.getByTestId("ed-confirm")).toHaveCount(0);

  await page.getByTestId("ed-save").click();
  await page.getByTestId("ed-confirm-apply").click();
  await expect(page.getByTestId("ed-result")).toContainText(/saved/i);
});

// Epic 20.3 — the change-safety confirm now uses the accessible Modal primitive: it is an
// alertdialog with aria-modal, focus trapped while open, Escape closes it with no change
// applied, and focus returns to the Save button that opened it.
test("change-safety confirm is an accessible modal: focus-trapped, Escape-closable, focus restored (Epic 20.3)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.goto("/admin?mode=employee");

  const row = page.locator("tr", { hasText: "Allowy Manager" });
  await row.getByRole("link", { name: /Manage|Selected/ }).click();
  await expect(page.getByTestId("employee-detail")).toBeVisible();

  // Open the confirm via a sensitive edit.
  await page.getByTestId("ed-level").selectOption("APPROVER");
  await page.getByTestId("ed-save").click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  // On open, focus has moved into the dialog (the first focusable = Confirm & save).
  await expect(page.getByTestId("ed-confirm-apply")).toBeFocused();

  // Tab cycles within the dialog: Confirm -> Cancel -> wraps back to Confirm.
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("ed-confirm-cancel")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("ed-confirm-apply")).toBeFocused();

  // Escape closes with NO change applied, and focus returns to the Save button.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ed-confirm")).toHaveCount(0);
  await expect(page.getByTestId("ed-save")).toBeFocused();
  await expect(page.getByTestId("ed-result")).toHaveCount(0);
});
