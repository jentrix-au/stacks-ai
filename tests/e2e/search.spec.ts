import { test, expect } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

// P3.1 global search: cmd-K palette + /[ws]/search, backed by Postgres FTS.
// Seeded fixtures: task "Checkout crashes on invalid card" (the word
// "expired" appears only in its description) and contact Dana Reyes
// <dana@globex.com>.

test.describe("Global search", () => {
  test("palette finds a task by a description word and opens it", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo");

    await page
      .getByRole("button", { name: /open command palette/i })
      .click();
    await page.getByPlaceholder(/search tasks/i).fill("expired");

    const option = page.getByRole("option", {
      name: /checkout crashes on invalid card/i,
    });
    await expect(option).toBeVisible();
    await option.click();

    // Deep link lands on the bugs board with the detail panel open.
    await expect(page).toHaveURL(/\/demo\/board\/bugs\?task=/);
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText("Checkout crashes on invalid card").first(),
    ).toBeVisible();
  });

  test("palette keyboard navigation: type, arrow to an option, Enter", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo");

    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder(/search tasks/i);
    await expect(input).toBeVisible();
    await input.fill("globex");

    // Tasks group lists "Globex annual contract" first; People has Dana.
    await expect(
      page.getByRole("option", { name: /globex annual contract/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: /dana reyes/i }),
    ).toBeVisible();

    // First option is auto-selected; Enter opens it.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/demo\/board\/pipeline\?task=/);
  });

  test("search page finds a contact by email and a task by description word", async ({
    page,
  }) => {
    await signInAsDemo(page);

    await page.goto(`/demo/search?q=${encodeURIComponent("dana@globex.com")}`);
    await expect(page.getByText("Dana Reyes")).toBeVisible();

    await page.goto("/demo/search?q=expired");
    await expect(
      page.getByRole("link", { name: /checkout crashes on invalid card/i }),
    ).toBeVisible();
  });
});
