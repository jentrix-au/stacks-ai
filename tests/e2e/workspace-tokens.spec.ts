import { test, expect } from "@playwright/test";

import { signInAsDemo } from "./_helpers";

// Workspace token governance: admins see tokens pinned to their workspace
// (any member's) in settings and can revoke them there.
test.describe("Workspace agent tokens (admin)", () => {
  test("a pinned token appears in settings and can be revoked by an admin", async ({
    page,
  }) => {
    const tokenName = `e2e governed ${Date.now()}`;
    await signInAsDemo(page);

    // Create a workspace-pinned token through the personal tokens UI.
    await page.goto("/account/tokens");
    await page.getByRole("button", { name: "New token" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(tokenName);
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Acme Inc." }).click();
    await dialog.getByRole("button", { name: "Create token" }).click();
    await expect(dialog.getByText(/tm_/).first()).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // It shows up in the workspace settings governance section.
    await page.goto("/demo/settings");
    const section = page.locator("section").filter({ hasText: "Agent tokens" });
    const row = section.getByRole("listitem").filter({ hasText: tokenName });
    await expect(row).toBeVisible();
    await expect(row.getByText("Active")).toBeVisible();

    // Admin revoke (native confirm).
    page.on("dialog", (d) => d.accept());
    await row.getByRole("button", { name: `Revoke ${tokenName}` }).click();
    await expect(page.getByText("Token revoked")).toBeVisible();
    await expect(row.getByText("Revoked")).toBeVisible();

    // The owner's personal page reflects the admin revocation.
    await page.goto("/account/tokens");
    const ownRow = page.getByRole("row", { name: new RegExp(tokenName) });
    await expect(ownRow.getByText("Revoked")).toBeVisible();
  });
});
