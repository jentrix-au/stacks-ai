import { test, expect, type Browser } from "@playwright/test";
import { signInAs, signInAsDemo } from "./_helpers";

// P3.7 acceptance: move card → auto-assign fires. The rule is created
// through the template builder, exercised via a real column move (status
// switcher → moveTask op → post-commit dispatch), verified through the
// assigned user's My Work, and deleted afterwards so reruns stay clean.

test.describe("Automations", () => {
  test("rule built from template auto-assigns on column move", async ({
    page,
    browser,
  }: {
    page: import("@playwright/test").Page;
    browser: Browser;
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/roadmap");

    // Build: moved to "In review" → assign Casey Teammate.
    await page.getByRole("button", { name: /board options/i }).click();
    await page.getByRole("menuitem", { name: /automations/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("combobox", { name: /column/i })
      .selectOption({ label: "In review" });
    await dialog
      .getByRole("combobox", { name: /member/i })
      .selectOption({ label: "Casey Teammate" });
    await dialog.getByRole("button", { name: /create rule/i }).click();
    const ruleRow = dialog.getByText(/moved to in review → assign casey/i);
    await expect(ruleRow).toBeVisible();
    await page.keyboard.press("Escape");

    // Trigger: move a card to "In review" via the detail panel switcher.
    await page
      .getByRole("button", { name: /mobile drag-and-drop qa/i })
      .first()
      .click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: /backlog/i }).click();
    await page.getByRole("menuitem", { name: /in review/i }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();
    await page.keyboard.press("Escape");

    // Verify: the automation assigned Casey — the task shows up in CASEY's
    // My Work (automation runs post-response, so poll).
    const caseyCtx = await browser.newContext();
    const casey = await caseyCtx.newPage();
    await signInAs(casey, "casey@stacks.local");
    await expect(async () => {
      await casey.goto("/demo/my-work");
      await expect(
        casey.getByRole("link", { name: /mobile drag-and-drop qa/i }),
      ).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await caseyCtx.close();

    // The rule recorded its run.
    await page.getByRole("button", { name: /board options/i }).click();
    await page.getByRole("menuitem", { name: /automations/i }).click();
    const reopened = page.getByRole("dialog");
    await expect(
      reopened.getByText(/moved to in review → assign casey/i),
    ).toBeVisible();
    await expect(reopened.getByText(/1 run/)).toBeVisible();

    // Cleanup: delete the rule so reruns/other specs aren't affected.
    await reopened
      .getByRole("button", { name: /delete rule moved to in review/i })
      .click();
    await expect(
      reopened.getByText(/moved to in review → assign casey/i),
    ).toHaveCount(0);
  });
});
