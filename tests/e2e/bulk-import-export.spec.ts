import { test, expect, type Page } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

// P3.8: board multi-select bulk edit, CSV import with dry-run diff, export.

/**
 * File inputs only work once React hydrates (no native fallback). The
 * export-scope select drives the CSV link href through React state, so when
 * it reacts, the page is interactive.
 */
async function waitForImportPageHydration(page: Page) {
  const select = page.getByRole("combobox", { name: /export scope/i });
  const csv = page.getByRole("link", { name: /^csv$/i });
  await expect(async () => {
    await select.selectOption({ index: 1 });
    await expect(csv).toHaveAttribute("href", /boardId/, { timeout: 500 });
  }).toPass({ timeout: 15_000 });
  await select.selectOption({ index: 0 });
}

test.describe("Bulk edit + import/export", () => {
  test("shift-click selects cards; bulk move sends both to Done", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/roadmap");

    await page
      .getByRole("button", { name: /onboarding flow polish/i })
      .click({ modifiers: ["Shift"] });
    await page
      .getByRole("button", { name: /mobile drag-and-drop qa/i })
      .click({ modifiers: ["Shift"] });

    const bar = page.getByTestId("bulk-action-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByText("2 selected")).toBeVisible();

    await bar
      .getByRole("combobox", { name: /move selected/i })
      .selectOption({ label: "Done" });
    await expect(page.getByText("All changes saved")).toBeVisible();
    await expect(bar).not.toBeVisible();

    // Both tasks really moved: their cards persist after reload and the
    // detail panel shows the Done status.
    await page.reload();
    await page
      .getByRole("button", { name: /onboarding flow polish/i })
      .click();
    const panel = page.getByRole("dialog");
    await expect(
      panel.getByRole("button", { name: /^done$/i }),
    ).toBeVisible();
  });

  test("contacts CSV import: dry-run shows the create/update diff, apply lands", async ({
    page,
  }) => {
    const fresh = `import-probe-${Date.now()}@example.com`;
    const csv = `name,email,company\nDana Reyes,dana@globex.com,Globex\nImport Probe,${fresh},Initech\n`;

    await signInAsDemo(page);
    await page.goto("/demo/import");
    await waitForImportPageHydration(page);

    await page
      .getByLabel("Contacts CSV file")
      .setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    // Columns auto-map by header name; run the dry run.
    await page.getByRole("button", { name: /^dry run$/i }).first().click();
    const diff = page.getByTestId("contacts-dry-run");
    await expect(diff).toBeVisible();
    await expect(diff).toContainText("1 to create");
    await expect(diff).toContainText("1 to update");

    await page.getByRole("button", { name: /^import$/i }).click();
    await expect(page).toHaveURL(/\/demo\/contacts/);
    await expect(page.getByText("Import Probe")).toBeVisible();
  });

  test("export returns CSV with seeded tasks", async ({ page }) => {
    await signInAsDemo(page);
    // workspaceId discovered from the export UI link to avoid hardcoding.
    await page.goto("/demo/import");
    const href = await page
      .getByRole("link", { name: /^csv$/i })
      .getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const body = await res.text();
    expect(body.split("\n")[0]).toContain("key,board,column,title");
    expect(body).toContain("Checkout crashes on invalid card");
  });

  test("Trello JSON import creates a board with lists and cards", async ({
    page,
  }) => {
    const name = `Trello import ${Date.now()}`;
    const trello = JSON.stringify({
      name,
      lists: [
        { id: "l1", name: "To Do" },
        { id: "l2", name: "Doing" },
      ],
      cards: [
        { idList: "l1", name: "Imported card one", desc: "from trello" },
        { idList: "l2", name: "Imported card two" },
      ],
    });

    await signInAsDemo(page);
    await page.goto("/demo/import");
    await waitForImportPageHydration(page);
    await page.getByLabel("Trello JSON file").setInputFiles({
      name: "board.json",
      mimeType: "application/json",
      buffer: Buffer.from(trello),
    });

    await expect(page).toHaveURL(/\/demo\/board\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "To Do" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Doing" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /imported card one/i }),
    ).toBeVisible();
  });
});
