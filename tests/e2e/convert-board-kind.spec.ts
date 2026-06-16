import { test, expect } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

// Converts the seeded TASKS board ("Product roadmap", slug /roadmap) to CRM
// and back. Deal sidecars created by the conversion are preserved on the way
// back by design; re-seeding restores the canonical demo state.
test.describe("Board kind conversion", () => {
  test("TASKS → CRM backfills deals, then converts back", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/roadmap");

    async function convertTo(kindLabel: string) {
      await page.getByRole("button", { name: "Board options" }).click();
      await page.getByText("Change board kind…").click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox").click();
      await page.getByRole("option", { name: kindLabel, exact: true }).click();
      await dialog
        .getByRole("button", { name: `Convert to ${kindLabel}` })
        .click();
      await expect(dialog).not.toBeVisible();
    }

    await convertTo("CRM");

    // The board renders as CRM: opening a task shows the Deal sidecar
    // (backfilled by the conversion for pre-existing tasks).
    await page
      .getByRole("button", { name: /onboarding flow polish/i })
      .first()
      .click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Deal", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();

    // Convert back so the demo board stays a TASKS board.
    await convertTo("Tasks");
    await page
      .getByRole("button", { name: /onboarding flow polish/i })
      .first()
      .click();
    await expect(
      page.getByRole("dialog").getByText("Deal", { exact: true }),
    ).toHaveCount(0);
  });
});
