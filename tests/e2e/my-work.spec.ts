import { test, expect } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

// P3.2 acceptance: assign → task appears in My Work; complete (archive,
// the app's completion analog) → it leaves.
//
// The assign/archive test creates its own probe task instead of touching
// seeded fixtures — other specs (task-links) depend on the seeded tasks.

test.describe("My Work", () => {
  test("shows seeded assigned tasks grouped, cross-board", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo/my-work");

    await expect(
      page.getByRole("heading", { name: /^my work$/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /assigned to me/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /onboarding flow polish/i }),
    ).toBeVisible();
  });

  test("assign → appears; archive → leaves", async ({ page }) => {
    const title = `My Work probe ${Date.now()}`;
    await signInAsDemo(page);

    // Create an unassigned probe task on the bugs board.
    await page.goto("/demo/board/bugs");
    await page.getByRole("button", { name: /add task/i }).first().click();
    await page.getByPlaceholder("Task title").fill(title);
    await page.keyboard.press("Enter");
    // The topbar sync badge confirms the server action actually persisted.
    await expect(page.getByText("All changes saved")).toBeVisible();

    // Unassigned → not in My Work.
    await page.goto("/demo/my-work");
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);

    // Assign it to me via the board detail panel.
    await page.goto("/demo/board/bugs");
    await page.getByRole("button", { name: title }).click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: /^assign$/i }).click();
    await page.getByRole("option", { name: /demo user/i }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();
    await page.keyboard.press("Escape"); // close the assignee popover

    // It now shows up in My Work.
    await page.goto("/demo/my-work");
    const row = page.getByRole("link", { name: title });
    await expect(row).toBeVisible();

    // Complete it (archive) from the detail panel — deep link via the row.
    await row.click();
    await expect(page).toHaveURL(/\/demo\/board\/bugs\?task=/);
    const detail = page.getByRole("dialog");
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: /archive/i }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();

    // Card leaves the board…
    await expect(page.getByRole("button", { name: title })).toHaveCount(0);

    // …and leaves My Work.
    await page.goto("/demo/my-work");
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);
  });

  test("workspace home shows the my-work digest and recent activity", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo");

    await expect(
      page.getByRole("heading", { name: /^my work$/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /recent activity/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /view all/i })).toBeVisible();
  });
});
