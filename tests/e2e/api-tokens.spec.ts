import { test, expect } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

// Creates a read-only token scoped to the demo workspace via the tokens UI,
// verifies the scope/workspace badges render, then revokes it so repeated
// runs don't accumulate rows.
test.describe("API tokens (scoped)", () => {
  test("create a read-only workspace-scoped token, then revoke it", async ({
    page,
  }) => {
    const tokenName = `e2e read-only ${Date.now()}`;
    await signInAsDemo(page);
    await page.goto("/account/tokens");

    await page.getByRole("button", { name: "New token" }).click();
    const dialog = page.getByRole("dialog");
    // exact: the P4.1 "Agent name (optional)" field also matches "Name".
    await dialog.getByLabel("Name", { exact: true }).fill(tokenName);

    // Agent identity (P4.1) — shows as a chip on the token row.
    await dialog.getByLabel("Agent name (optional)").fill("Read Bot");
    await dialog.getByLabel("Emoji").fill("📖");

    // Default is read+write — drop write, keeping read only.
    await dialog.getByRole("checkbox", { name: "Scope: write" }).click();

    // Scope to the seeded demo workspace.
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Acme Inc." }).click();

    await dialog.getByRole("button", { name: "Create token" }).click();

    // The one-time token reveal shows a tm_ secret.
    await expect(dialog.getByText(/tm_/).first()).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // The list shows the scope, workspace, and agent identity.
    const row = page.getByRole("row", { name: new RegExp(tokenName) });
    await expect(row.getByText("read", { exact: true })).toBeVisible();
    await expect(row.getByText("Acme Inc.")).toBeVisible();
    await expect(row.getByText("Active")).toBeVisible();
    await expect(row.getByText("📖 Read Bot")).toBeVisible();

    // Clean up: revoke (confirm dialog is a native confirm()).
    page.on("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Revoke token" }).click();
    await expect(row.getByText("Revoked")).toBeVisible();
  });
});
