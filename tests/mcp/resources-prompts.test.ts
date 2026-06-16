import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

const OVERVIEW = {
  workspace: { id: "ws_1", name: "Acme", slug: "acme", taskPrefix: "ACM" },
  role: "OWNER",
  counts: { boards: 1, members: 2, openTasks: 5 },
  boards: [
    { id: "board_1", name: "Sprint", slug: "sprint", kind: "TASKS", openTasks: 5 },
  ],
  members: [
    { userId: "user_1", name: "Demo", email: "demo@acme.test", role: "OWNER" },
  ],
};

const SNAPSHOT = {
  board: { id: "board_1", name: "Sprint", slug: "sprint", kind: "TASKS" },
  workspaceId: "ws_1",
  taskPrefix: "ACM",
  totalTasks: 1,
  columns: [
    {
      id: "col_1",
      name: "Todo",
      position: 1024,
      wipLimit: null,
      tasks: [
        {
          id: "task_1",
          number: 7,
          key: "ACM-7",
          title: "T",
          priority: "MEDIUM",
          dueAt: null,
        },
      ],
    },
  ],
};

const TASK = { id: "task_1", number: 7, key: "ACM-7", title: "T" };

vi.mock("@/server/queries/mcp-context", () => ({
  getMcpTask: vi.fn(),
  listMcpBoards: vi.fn(),
  listMcpColumns: vi.fn(),
  listMcpLabels: vi.fn(),
  listMcpMembers: vi.fn(),
  listMcpTasks: vi.fn(),
  listMcpWorkspaces: vi.fn(async () => [
    { id: "ws_1", name: "Acme", slug: "acme", role: "OWNER" },
  ]),
  searchMcpTasks: vi.fn(),
  listMcpActivity: vi.fn(),
  listMcpAttachments: vi.fn(),
  getMcpBoardSnapshot: vi.fn(async () => SNAPSHOT),
  getMcpWorkspaceOverview: vi.fn(async () => OVERVIEW),
  getMcpTaskByKey: vi.fn(async () => TASK),
}));

import { connectMcp, testAuth } from "./_harness";

describe("MCP resources (P2.5)", () => {
  it("lists the three resource templates", async () => {
    const { client } = await connectMcp();
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate).sort()).toEqual([
      "stacks://board/{id}",
      "stacks://task/{key}",
      "stacks://workspace/{id}",
    ]);
  });

  it("lists the caller's workspaces as concrete resources", async () => {
    const { client } = await connectMcp();
    const { resources } = await client.listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe("stacks://workspace/ws_1");
    expect(resources[0].name).toBe("Acme");
  });

  it("reads a workspace overview as JSON", async () => {
    const { client } = await connectMcp();
    const result = await client.readResource({
      uri: "stacks://workspace/ws_1",
    });
    expect(result.contents[0].mimeType).toBe("application/json");
    expect(
      JSON.parse((result.contents[0] as { text: string }).text),
    ).toEqual(OVERVIEW);
  });

  it("reads a board snapshot and a task by key", async () => {
    const { client } = await connectMcp();
    const board = await client.readResource({ uri: "stacks://board/board_1" });
    expect(
      JSON.parse((board.contents[0] as { text: string }).text),
    ).toEqual(SNAPSHOT);
    const task = await client.readResource({ uri: "stacks://task/ACM-7" });
    expect(JSON.parse((task.contents[0] as { text: string }).text)).toEqual(
      TASK,
    );
  });

  it("rejects resource reads for tokens without the read scope", async () => {
    const { client } = await connectMcp(testAuth({ scopes: ["write"] }));
    await expect(
      client.readResource({ uri: "stacks://workspace/ws_1" }),
    ).rejects.toThrow(/read/);
  });
});

describe("MCP prompts (P2.5)", () => {
  it("lists the four workflow prompts", async () => {
    const { client } = await connectMcp();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "daily_standup",
      "pipeline_review",
      "sla_watch",
      "triage_bugs",
    ]);
    for (const p of prompts) expect(p.description).toBeTruthy();
  });

  it("each prompt renders with its arguments interpolated", async () => {
    const { client } = await connectMcp();

    const cases: Array<{
      name: string;
      args: Record<string, string>;
      expectText: string[];
    }> = [
      {
        name: "triage_bugs",
        args: { boardId: "board_9" },
        expectText: ["board_9", "get_board_snapshot", "update_bug_report"],
      },
      {
        name: "daily_standup",
        args: { boardId: "board_9", since: "2026-06-11T09:00:00Z" },
        expectText: ["board_9", "2026-06-11T09:00:00Z", "list_activity"],
      },
      {
        name: "pipeline_review",
        args: { workspaceId: "ws_9" },
        expectText: ["ws_9", "list_boards", "deal"],
      },
      {
        name: "sla_watch",
        args: { boardId: "board_9", withinHours: "6" },
        expectText: ["board_9", "6", "slaDueAt"],
      },
    ];

    for (const c of cases) {
      const result = await client.getPrompt({
        name: c.name,
        arguments: c.args,
      });
      const text = (
        result.messages[0].content as { type: "text"; text: string }
      ).text;
      for (const fragment of c.expectText) {
        expect(text, `${c.name} should mention ${fragment}`).toContain(
          fragment,
        );
      }
    }
  });
});
