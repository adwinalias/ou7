import { expect, type Page, test } from "@playwright/test";

// The wall-chart fixture user (seeded with one APPROVED + one PENDING leave + a period)
// is untouched by the other specs, so their history is deterministic.
const USER = "e2e-wall@interestingtimes.me";

async function signIn(page: Page, email: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, callbackUrl: "/dashboard", json: "true" },
  });
}

test("my leave shows the allowance panel and own history (Epic 7.1/7.3)", async ({ page }) => {
  await signIn(page, USER);
  await page.goto("/my-leave");
  await expect(page.getByRole("heading", { name: "My leave" })).toBeVisible();

  // 7.3 — allowance panel with the seeded period (opening 26).
  const panel = page.getByTestId("allowance-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("26").first()).toBeVisible();

  // 7.1 — history shows both an approved and a pending row (pending visually distinct).
  const table = page.getByTestId("history-table");
  await expect(table.getByText("Approved")).toBeVisible();
  await expect(table.getByText("Pending")).toBeVisible();
});

test("history filters by decision (Epic 7.1)", async ({ page }) => {
  await signIn(page, USER);
  await page.goto("/my-leave?decision=APPROVED");

  const table = page.getByTestId("history-table");
  await expect(table.getByText("Approved")).toBeVisible();
  await expect(table.getByText("Pending")).toHaveCount(0); // pending row filtered out
});
