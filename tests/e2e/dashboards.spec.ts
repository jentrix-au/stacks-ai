import { test, expect } from "@playwright/test";
import { signInAsDemo } from "./_helpers";

// P3.5: dashboards numbers come from the seed (one $48k deal in
// Negotiation, one HIGH ticket, one CRITICAL bug, one blocked 2026-Q3
// initiative); the roadmap graph must render the blocked path
// bug → initiative across boards.

test.describe("Dashboards + roadmap graph", () => {
  test("dashboards show seeded cross-board metrics", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/dashboards");

    await expect(
      page.getByRole("heading", { name: /^dashboards$/i }),
    ).toBeVisible();

    // CRM
    await expect(page.getByText("$48,000").first()).toBeVisible();
    // Support + Bugs + Roadmap sections render with charts.
    await expect(
      page.getByRole("heading", { name: /^support$/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /^bugs$/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^roadmap$/i }),
    ).toBeVisible();
    expect(await page.getByTestId("bar-chart").count()).toBeGreaterThanOrEqual(
      4,
    );
  });

  test("roadmap graph renders the blocked path", async ({ page }) => {
    await signInAsDemo(page);
    await page.goto("/demo/roadmap");

    const graph = page.getByTestId("roadmap-graph");
    await expect(graph).toBeVisible();

    // The blocked initiative and its cross-board blocker are both nodes…
    await expect(
      graph.locator(".react-flow__node", { hasText: "Self-serve billing" }),
    ).toBeVisible();
    await expect(
      graph.locator(".react-flow__node", {
        hasText: "Checkout crashes on invalid card",
      }),
    ).toBeVisible();
    await expect(
      graph.locator(".react-flow__node", { hasText: "Blocked" }),
    ).toBeVisible();

    // …connected by a BLOCKS edge.
    await expect(graph.locator(".react-flow__edge")).toHaveCount(1);
    await expect(graph.getByText("blocks", { exact: true })).toBeVisible();
  });
});
