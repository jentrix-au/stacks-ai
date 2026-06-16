import { test, expect } from "@playwright/test";

// The in-app documentation at /docs renders docs/*.md. Public — no auth.
test.describe("Docs", () => {
  test("index renders and internal markdown links route in-app", async ({
    page,
  }) => {
    await page.goto("/docs");
    await expect(
      page.getByRole("heading", { name: "Stacks documentation" }),
    ).toBeVisible();

    // A relative .md link in the markdown is rewritten to an app route.
    await page
      .getByTestId("doc-content")
      .getByRole("link", { name: "Getting started" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/docs\/getting-started$/);
    await expect(
      page.getByRole("heading", { name: "Getting started", level: 1 }),
    ).toBeVisible();
  });

  test("guide pages render tables and sidebar navigation works", async ({
    page,
  }) => {
    await page.goto("/docs/agent-platform");
    await expect(
      page.getByRole("heading", { name: "Agent platform (MCP)" }),
    ).toBeVisible();
    // The GFM tool-catalog tables made it through the renderer.
    await expect(
      page.getByRole("cell", { name: "get_board_snapshot", exact: true }),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "Documentation" })
      .getByRole("link", { name: "Deployment" })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Deployment", level: 1 }),
    ).toBeVisible();
  });

  test("unknown slugs 404", async ({ page }) => {
    const response = await page.goto("/docs/nope");
    expect(response?.status()).toBe(404);
  });
});
