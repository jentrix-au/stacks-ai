import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { signInAsDemo } from "./_helpers";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const BASE_URL = `http://localhost:${PORT}`;

// P2.8 acceptance: an MCP mutation (real HTTP MCP stack, real PAT) shows up
// in the board UI with the attribution badge, and the tokens page shows
// usage numbers for the token. P4.1: the badge carries the token's agent
// identity (displayName + emoji) and the activity feed filters by source.
test.describe("Agent attribution", () => {
  test("MCP comment renders the via-agent badge; tokens page shows usage", async ({
    page,
  }) => {
    // Mint a dev PAT (with a P4.1 agent identity) and drive the real MCP
    // endpoint with the SDK client.
    const tokenRes = await page.request.post(`${BASE_URL}/api/dev/mcp-token`, {
      data: {
        name: "E2E Attribution Bot",
        displayName: "Attribution Bot",
        emoji: "🧪",
      },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = (await tokenRes.json()) as { token: string };

    const transport = new StreamableHTTPClientTransport(
      new URL(`${BASE_URL}/api/mcp`),
      { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const client = new Client({ name: "e2e", version: "0.0.0" });
    await client.connect(transport);

    // Find the seeded demo board + a task on it.
    const workspaces = (await client.callTool({
      name: "list_workspaces",
      arguments: {},
    })) as unknown as { structuredContent: { workspaces: { id: string }[] } };
    const workspaceId = workspaces.structuredContent.workspaces[0].id;

    const boards = (await client.callTool({
      name: "list_boards",
      arguments: { workspaceId },
    })) as unknown as {
      structuredContent: { boards: { id: string; slug: string }[] };
    };
    const board = boards.structuredContent.boards.find(
      (b) => b.slug === "roadmap",
    )!;

    const tasks = (await client.callTool({
      name: "list_tasks",
      arguments: { boardId: board.id, take: 1 },
    })) as unknown as {
      structuredContent: { tasks: { id: string; title: string }[] };
    };
    const task = tasks.structuredContent.tasks[0];

    const stamp = `attribution-check ${Date.now()}`;
    const created = (await client.callTool({
      name: "create_comment",
      arguments: { taskId: task.id, body: stamp },
    })) as { isError?: boolean };
    expect(created.isError).toBeFalsy();
    await client.close();

    // The board UI shows the badge — with the P4.1 agent identity — on the
    // comment.
    await signInAsDemo(page);
    await page.goto("/demo/board/roadmap");
    await page
      .getByRole("button", { name: new RegExp(task.title.slice(0, 24)) })
      .first()
      .click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText(stamp)).toBeVisible();
    await expect(
      panel.getByText("via 🧪 Attribution Bot").first(),
    ).toBeVisible();

    // …and in the activity feed.
    await panel.getByText("Activity", { exact: true }).click();
    await expect(
      panel.getByText("via 🧪 Attribution Bot").nth(1),
    ).toBeVisible();

    // P4.1 source filter: "Agents" keeps the MCP row, "Humans" hides it.
    await panel.getByRole("button", { name: "Agents", exact: true }).click();
    await expect(
      panel.getByText("via 🧪 Attribution Bot").nth(1),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Humans", exact: true }).click();
    await expect(panel.getByText("via 🧪 Attribution Bot")).toHaveCount(1);
    await panel.getByRole("button", { name: "All", exact: true }).click();

    // Tokens page shows non-zero usage for the token.
    await page.goto("/account/tokens");
    const row = page.getByRole("row", { name: /E2E Attribution Bot/ });
    await expect(row.getByTestId("token-usage")).not.toHaveText(
      "0 req · 0 mut",
    );

    // Clean up the comment so reruns stay tidy (UI delete, author = demo).
    await page.goto("/demo/board/roadmap");
    await page
      .getByRole("button", { name: new RegExp(task.title.slice(0, 24)) })
      .first()
      .click();
    const commentRow = page
      .getByRole("dialog")
      .locator("li", { hasText: stamp });
    await commentRow.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("dialog").getByText(stamp)).toHaveCount(0);
  });
});
