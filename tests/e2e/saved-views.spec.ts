import { test, expect } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

// P3.4 acceptance: create/apply/delete a view; filters survive reload via
// the view (filters live in the URL, the view re-applies them).
//
// Seeded fixtures: "Product roadmap" board with a shared "High priority"
// view; "Mobile drag-and-drop QA" (HIGH) and 4 non-HIGH tasks.

test.describe("Saved views", () => {
  test("seeded shared view chip applies its filters", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/roadmap");

    await page
      .getByRole("button", { name: "High priority", exact: true })
      .click();
    await expect(page).toHaveURL(/priorities=/);
    // Only the HIGH-priority seeded tasks remain visible.
    await expect(
      page.getByRole("button", { name: /mobile drag-and-drop qa/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /onboarding flow polish/i }),
    ).toHaveCount(0);
  });

  test("create → apply after reload → delete", async ({ page }) => {
    const viewName = `Urgent only ${Date.now()}`;
    await signInAsDemo(page);

    // Filter to URGENT via the filter UI.
    await page.goto("/demo/board/roadmap?priorities=URGENT");
    await expect(page.getByText("Drop tasks here")).toHaveCount(4);

    // Save the current filter state as a view.
    await page.getByRole("button", { name: /save view/i }).click();
    await page.getByLabel("View name").fill(viewName);
    await page.getByRole("button", { name: /^save view$/i }).last().click();
    await expect(page.getByText("All changes saved")).toBeVisible();
    await expect(
      page.getByRole("button", { name: viewName, exact: true }),
    ).toBeVisible();

    // Reload clean, re-apply via the chip: filters come back via the URL.
    await page.goto("/demo/board/roadmap");
    await expect(
      page.getByRole("button", { name: /onboarding flow polish/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: viewName, exact: true }).click();
    await expect(page).toHaveURL(/priorities=URGENT/);
    await expect(page.getByText("Drop tasks here")).toHaveCount(4);

    // Reload with the URL the view produced — filters survive.
    await page.reload();
    await expect(page).toHaveURL(/priorities=URGENT/);
    await expect(page.getByText("Drop tasks here")).toHaveCount(4);

    // Delete the view (hover reveals the ×).
    await page.getByRole("button", { name: viewName, exact: true }).hover();
    await page
      .getByRole("button", { name: `Delete view ${viewName}` })
      .click();
    await expect(
      page.getByRole("button", { name: viewName, exact: true }),
    ).toHaveCount(0);
  });
});
