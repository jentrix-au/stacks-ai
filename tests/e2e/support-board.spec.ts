import { test, expect } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

// Seeded state (prisma/seed.ts): SUPPORT board "Support desk" with ticket
// "Cannot download invoices" linked to contact Dana Reyes — who is also a
// contact on the CRM deal (one party directory after the Customer merge).
test.describe("Support board (contacts as the party directory)", () => {
  test("ticket panel shows the linked contact", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/support");

    await page
      .getByRole("button", { name: /cannot download invoices/i })
      .click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Contact", { exact: true })).toBeVisible();
    await expect(panel.getByText("Dana Reyes")).toBeVisible();
  });

  test("unlinks and relinks a contact on the ticket", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/support");
    await page
      .getByRole("button", { name: /cannot download invoices/i })
      .click();
    const panel = page.getByRole("dialog");

    await panel.getByRole("button", { name: /unlink contact/i }).click();
    await expect(panel.getByText("Dana Reyes")).toHaveCount(0);

    await panel.getByRole("button", { name: /add contact/i }).click();
    await page.getByPlaceholder("Search or create…").fill("Dana");
    await page.getByRole("option", { name: /dana reyes/i }).click();
    // The picker trigger now shows the linked contact.
    await expect(
      panel.getByRole("button", { name: /dana reyes/i }),
    ).toBeVisible();
  });

  test("the same person appears on the CRM deal", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/board/pipeline");
    await page.getByRole("button", { name: /globex annual contract/i }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Dana Reyes")).toBeVisible();
  });

  test("the customers page redirects to the unified People page", async ({
    page,
  }) => {
    await signInAsDemo(page);
    await page.goto("/demo/customers");
    await expect(page).toHaveURL(/\/demo\/contacts/);
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
    await expect(page.getByText("Dana Reyes")).toBeVisible();
  });
});
