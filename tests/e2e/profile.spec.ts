import { test, expect } from "@playwright/test";

import { signInAsDemo } from "./_helpers";

// Regression: the user menu's Profile item used to be a dead entry (no
// handler), and /account had no index page.
test.describe("Profile", () => {
  test("user menu opens the profile page and name edits persist", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo");

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByText("Profile", { exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole("heading", { name: "Profile", level: 1 }),
    ).toBeVisible();

    const name = page.getByLabel("Name");
    await expect(name).toHaveValue("Demo User");
    await name.fill("Demo User (edited)");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile updated")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Name")).toHaveValue("Demo User (edited)");

    // Restore the seeded name so other specs aren't affected.
    await page.getByLabel("Name").fill("Demo User");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile updated")).toBeVisible();
  });

  test("workspace settings links to API token management", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/settings");

    await page.getByRole("link", { name: "Manage API tokens →" }).click();
    await expect(page).toHaveURL(/\/account\/tokens$/);
    await expect(
      page.getByRole("heading", { name: "API tokens", level: 1 }),
    ).toBeVisible();
  });

  test("account tabs switch between profile and tokens", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/account");

    const nav = page.getByRole("navigation", { name: "Account" });
    await nav.getByRole("link", { name: "API tokens" }).click();
    await expect(page).toHaveURL(/\/account\/tokens$/);
    await nav.getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });
});
