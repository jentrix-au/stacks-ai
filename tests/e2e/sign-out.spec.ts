import { test, expect } from "@playwright/test";

import { signInAsDemo } from "./_helpers";

// Regression: signOut({ redirectTo }) throws Next's NEXT_REDIRECT control-
// flow error; useSyncedTransition used to catch it and toast "NEXT_REDIRECT"
// instead of letting the navigation happen.
test.describe("Sign out", () => {
  test("lands on the marketing page with no NEXT_REDIRECT toast", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo");

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByText("Sign out").click();

    // The redirect goes through: signed-out home page renders.
    await expect(
      page.getByRole("heading", { name: /move work forward/i }),
    ).toBeVisible();
    await expect(page.getByText("NEXT_REDIRECT")).toHaveCount(0);

    // The session is really gone — a workspace page bounces to /login.
    await page.goto("/demo");
    await expect(page).toHaveURL(/\/login/);
  });
});
