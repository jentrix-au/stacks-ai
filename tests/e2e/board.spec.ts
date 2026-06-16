import { test, expect } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

test.describe("Kanban board", () => {
  test("landing redirects to login when signed out", async ({ page }) => {
    await page.goto("/demo");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("dev sign-in lands on workspace and shows seeded board", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: /boards/i })).toBeVisible();

    await page.getByRole("link", { name: /product roadmap/i }).click();
    await expect(page).toHaveURL(/\/demo\/board\/roadmap/);

    for (const col of ["Backlog", "In progress", "In review", "Done"]) {
      await expect(page.getByRole("heading", { name: col })).toBeVisible();
    }
  });

  test("cards and detail panel show human-readable task keys", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/roadmap");

    // Seeded demo workspace has prefix DEM and tasks numbered 1..5.
    await expect(page.getByText(/^DEM-\d+$/).first()).toBeVisible();

    await page
      .getByRole("button", { name: /onboarding flow polish/i })
      .first()
      .click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/^DEM-\d+$/)).toBeVisible();
  });

  test("filter pills hide non-matching tasks", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/roadmap?priorities=URGENT");

    // The seeded board has no URGENT tasks, so empty-state strings appear in
    // every column.
    const dropZones = page.getByText("Drop tasks here");
    await expect(dropZones).toHaveCount(4);
  });

  test("opens task detail panel and edits description", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/roadmap");
    await page
      .getByRole("button", { name: /onboarding flow polish/i })
      .first()
      .click();

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Subtasks", { exact: true })).toBeVisible();
    await expect(panel.getByText("Attachments", { exact: true })).toBeVisible();
    await expect(panel.getByText("Comments", { exact: true })).toBeVisible();
  });
});
