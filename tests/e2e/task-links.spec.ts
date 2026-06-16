import { test, expect } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

// Seeded state (prisma/seed.ts): bug "Checkout crashes on invalid card" on
// the BUGS board BLOCKS deal "Globex annual contract" on the CRM board.
test.describe("Task links (cross-kind)", () => {
  test("deal card shows Blocked badge from the seeded bug link", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/pipeline");

    const dealCard = page.getByRole("button", {
      name: /globex annual contract/i,
    });
    await expect(dealCard).toBeVisible();
    await expect(dealCard.getByText("Blocked")).toBeVisible();
  });

  test("detail panel lists the incoming cross-board link", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/pipeline");
    await page.getByRole("button", { name: /globex annual contract/i }).click();

    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Links", { exact: true })).toBeVisible();
    await expect(panel.getByText("Incoming")).toBeVisible();
    await expect(
      panel.getByText(/checkout crashes on invalid card/i),
    ).toBeVisible();
    await expect(panel.getByText("Bug tracker")).toBeVisible();
  });

  test("adds and removes a link from the panel", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/pipeline");
    await page.getByRole("button", { name: /globex annual contract/i }).click();
    const panel = page.getByRole("dialog");

    // Default kind is "Relates to"; pick a TASKS-board target.
    await panel.getByRole("button", { name: /add link/i }).click();
    await page.getByPlaceholder("Search tasks…").fill("Onboarding");
    await page.getByRole("option", { name: /onboarding flow polish/i }).click();

    const outgoingChip = panel
      .locator("li")
      .filter({ hasText: /onboarding flow polish/i });
    await expect(outgoingChip).toBeVisible();

    // Remove it again so the seeded state stays canonical for other tests.
    await outgoingChip.getByRole("button", { name: /remove link/i }).click();
    await expect(outgoingChip).toHaveCount(0);
  });

  test("rejects a link that would create a cycle, naming the path", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/pipeline");
    await page.getByRole("button", { name: /globex annual contract/i }).click();
    const panel = page.getByRole("dialog");

    // deal → bug BLOCKS, while bug → deal BLOCKS already exists. The kind
    // trigger is the combobox currently showing "Relates to" (the default).
    await panel.getByRole("combobox").filter({ hasText: "Relates to" }).click();
    await page.getByRole("option", { name: "Blocks", exact: true }).click();
    await panel.getByRole("button", { name: /add link/i }).click();
    await page.getByPlaceholder("Search tasks…").fill("Checkout crashes");
    await page
      .getByRole("option", { name: /checkout crashes on invalid card/i })
      .click();

    // The server rejects it; the error surfaces (toast + sync badge) and
    // names the cycle path by task key.
    await expect(
      page.getByText(/would create a cycle: DEM-\d+/i).first(),
    ).toBeVisible();
    // No outgoing chip materializes.
    await expect(
      panel.locator("li").filter({ hasText: /checkout crashes/i }),
    ).toHaveCount(1); // only the pre-existing incoming chip
  });
});
