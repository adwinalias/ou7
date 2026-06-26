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

test("pending-row decision controls wrap on a phone (Epic 25.3)", async ({ page }) => {
  await signIn(page, HR_EMAIL);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/pending");

  const row = page.getByTestId("pending-row").first();
  await expect(row).toBeVisible();

  // The decision cell's flex container wraps: the Approve button sits on a new line
  // BELOW the reason input (its top is at/below the input's bottom). A top-offset delta
  // alone would be a false guard — the input is taller than the buttons, so their tops
  // differ even on a single non-wrapped line. Line separation is the real signal.
  const reason = row.getByTestId("pending-reason");
  const approve = row.getByTestId("pending-approve");
  const rb = await reason.boundingBox();
  const ab = await approve.boundingBox();
  expect(ab!.y).toBeGreaterThanOrEqual(rb!.y + rb!.height - 1); // Approve wrapped below the input

  // The input keeps a usable width on the phone.
  expect(rb!.width).toBeGreaterThanOrEqual(100);
});
