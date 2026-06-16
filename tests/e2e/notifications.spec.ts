import { test, expect, type Browser, type Page } from "@playwright/test";
import { signInAs, signInAsDemo } from "./_helpers";

// P3.3 acceptance: mention → in-app notification (the email leg is
// unit-tested with an injected transport — no real mail in e2e); watcher
// gets a comment notification; bell + inbox e2e.
//
// Seeded fixtures: Casey Teammate (casey@stacks.local) is a MEMBER and
// watches "Checkout crashes on invalid card" (DEM-6).

async function commentOnBugTask(page: Page, body: string, mention?: string) {
  await page.goto("/demo/board/bugs");
  await page
    .getByRole("button", { name: /checkout crashes on invalid card/i })
    .first()
    .click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();

  const editor = panel.getByPlaceholder(/write a comment/i);
  await editor.fill(body);
  if (mention) {
    await editor.pressSequentially(` @${mention.slice(0, 3)}`);
    const option = page
      .getByRole("listbox", { name: /mention a member/i })
      .getByRole("option", { name: new RegExp(mention, "i") });
    await expect(option).toBeVisible();
    await page.keyboard.press("Enter"); // pick the highlighted candidate
    await expect(editor).toHaveValue(new RegExp(`@${mention}`));
  }
  await panel.getByRole("button", { name: /^comment$/i }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
}

async function openAsCasey(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAs(page, "casey@stacks.local");
  return { context, page };
}

/** Start from a clean inbox — earlier specs may have notified Casey. */
async function clearCaseyInbox(page: Page) {
  await page.goto("/demo/inbox");
  const markAll = page.getByRole("button", { name: /mark all read/i });
  if (await markAll.isVisible().catch(() => false)) {
    await markAll.click();
    await expect(page.getByText(/all caught up/i)).toBeVisible();
  }
}

test.describe("Notifications", () => {
  test("mention → bell badge, inbox row, deep link, mark read", async ({
    page,
    browser,
  }) => {
    const stamp = `mention-check ${Date.now()}`;
    const casey = await openAsCasey(browser);
    await clearCaseyInbox(casey.page);

    await signInAsDemo(page);
    await commentOnBugTask(page, stamp, "Casey Teammate");

    await casey.page.goto("/demo");
    await expect(casey.page.getByTestId("unread-badge")).toBeVisible();

    await casey.page
      .getByRole("link", { name: /notifications/i })
      .click();
    await expect(casey.page).toHaveURL(/\/demo\/inbox/);
    const row = casey.page
      .getByRole("button")
      .filter({ hasText: "mentioned you" })
      .filter({ hasText: stamp });
    await expect(row).toBeVisible();
    await expect(row).toContainText("DEM-");

    // Deep link opens the task panel — and the click marks the row read.
    await row.click();
    await expect(casey.page).toHaveURL(/\/demo\/board\/bugs\?task=/);
    await expect(casey.page.getByRole("dialog")).toBeVisible();

    // Click-through marked it read → badge clears.
    await casey.page.goto("/demo/inbox");
    await expect(casey.page.getByText(/all caught up/i)).toBeVisible();
    await expect(casey.page.getByTestId("unread-badge")).toHaveCount(0);

    await casey.context.close();
  });

  test("watcher gets a notification when someone comments", async ({
    page,
    browser,
  }) => {
    const stamp = `watcher-check ${Date.now()}`;
    await signInAsDemo(page);
    await commentOnBugTask(page, stamp); // no mention — plain comment

    const casey = await openAsCasey(browser);
    await casey.page.goto("/demo/inbox");
    const row = casey.page
      .getByRole("button")
      .filter({ hasText: "commented on" })
      .filter({ hasText: stamp });
    await expect(row).toBeVisible();

    // "Mark all read" clears the badge without opening anything.
    await casey.page.getByRole("button", { name: /mark all read/i }).click();
    await expect(casey.page.getByText(/all caught up/i)).toBeVisible();
    await expect(casey.page.getByTestId("unread-badge")).toHaveCount(0);

    await casey.context.close();
  });
});
