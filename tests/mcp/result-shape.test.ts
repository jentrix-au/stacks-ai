import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

// Canned op results — the SDK validates them against each tool's
// outputSchema before returning, so these tests freeze BOTH the wire shape
// and the schema ↔ serializer agreement.
const LIST_TASKS_RESULT = {
  boardId: "board_1",
  boardName: "Sprint 12",
  boardKind: "TASKS",
  totalCount: 2,
  tasks: [
    {
      id: "task_1",
      number: 7,
      key: "STK-7",
      title: "Fix login redirect",
      columnId: "col_1",
      columnName: "In progress",
      priority: "HIGH",
      dueAt: "2026-06-20T00:00:00.000Z",
      archivedAt: null,
    },
    {
      id: "task_2",
      number: 8,
      key: "STK-8",
      title: "Polish empty states",
      columnId: "col_2",
      columnName: "Todo",
      priority: "MEDIUM",
      dueAt: null,
      archivedAt: null,
    },
  ],
  nextCursor: null,
};

const CREATE_TASK_RESULT = { id: "task_9", number: 42, key: "STK-42" };

vi.mock("@/server/queries/mcp-context", async () => {
  const { AuthzError } = await import("@/lib/authz");
  return {
    getMcpTask: vi.fn(),
    listMcpBoards: vi.fn(),
    listMcpColumns: vi.fn(),
    listMcpLabels: vi.fn(),
    listMcpMembers: vi.fn(),
    listMcpTasks: vi.fn(
      async (_userId: string, input: { boardId?: string | null }) => {
        if (!input.boardId) {
          throw new AuthzError(
            "Must provide boardId or columnId to list_tasks",
            400,
          );
        }
        return LIST_TASKS_RESULT;
      },
    ),
    listMcpWorkspaces: vi.fn(),
  };
});

vi.mock("@/server/tasks/operations", () => ({
  createTask: vi.fn(async () => CREATE_TASK_RESULT),
  updateTask: vi.fn(),
  moveTask: vi.fn(),
  archiveTask: vi.fn(),
  setTaskLabels: vi.fn(),
  setTaskAssignees: vi.fn(),
  updateDeal: vi.fn(),
  setDealContacts: vi.fn(),
  updateBugReport: vi.fn(),
  updateTicket: vi.fn(),
  linkTicketContact: vi.fn(),
  updateInitiative: vi.fn(),
  listInitiatives: vi.fn(),
  addTaskLink: vi.fn(),
  removeTaskLink: vi.fn(),
  listTaskLinks: vi.fn(),
}));

const FIND_SIMILAR_RESULT = {
  tasks: [
    {
      id: "task_3",
      number: 11,
      key: "STK-11",
      title: "Login redirect loops on Safari",
      columnName: "Triage",
      boardId: "board_2",
      boardName: "Bug tracker",
      boardSlug: "bugs",
      boardKind: "BUGS",
      similarity: 0.8732,
    },
  ],
};

vi.mock("@/server/queries/similar", () => ({
  findSimilarToTask: vi.fn(async () => FIND_SIMILAR_RESULT),
  findSimilarToQuery: vi.fn(async () => ({
    tasks: [],
    notice:
      "Semantic search is not configured (no embeddings provider key) — use search_tasks for keyword search.",
  })),
}));

import { connectMcp, testAuth } from "./_harness";

describe("MCP result shapes (P2.2 acceptance)", () => {
  it("read tool (list_tasks): text fallback + validated structuredContent", async () => {
    const { client } = await connectMcp();
    const result = await client.callTool({
      name: "list_tasks",
      arguments: { boardId: "board_1" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(LIST_TASKS_RESULT);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text)).toEqual(LIST_TASKS_RESULT);
    expect(result).toMatchSnapshot();
  });

  it("write tool (create_task): returns id + number + semantic key", async () => {
    const { client } = await connectMcp();
    const result = await client.callTool({
      name: "create_task",
      arguments: { columnId: "col_1", title: "New task from agent" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(CREATE_TASK_RESULT);
    expect(result).toMatchSnapshot();
  });

  it("semantic tool (find_similar_tasks): similarity rows + disabled notice (P4.3)", async () => {
    const { client } = await connectMcp();
    const byTask = await client.callTool({
      name: "find_similar_tasks",
      arguments: { taskId: "task_1" },
    });
    expect(byTask.isError).toBeFalsy();
    expect(byTask.structuredContent).toEqual(FIND_SIMILAR_RESULT);
    expect(byTask).toMatchSnapshot();

    // Provider-off path: empty result with an actionable notice, not an error.
    const disabled = await client.callTool({
      name: "find_similar_tasks",
      arguments: { workspaceId: "ws_1", query: "login bug" },
    });
    expect(disabled.isError).toBeFalsy();
    expect((disabled.structuredContent as { notice?: string }).notice).toMatch(
      /not configured/,
    );

    // Neither taskId nor workspaceId+query is INVALID_INPUT.
    const invalid = await client.callTool({
      name: "find_similar_tasks",
      arguments: {},
    });
    expect(invalid.isError).toBe(true);
    const content = invalid.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text).error.code).toBe("INVALID_INPUT");
  });

  it("scope rejection travels the full wire as a structured envelope", async () => {
    const { client } = await connectMcp(testAuth({ scopes: ["read"] }));
    const result = await client.callTool({
      name: "create_task",
      arguments: { columnId: "col_1", title: "Should be rejected" },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    expect(payload.error.code).toBe("FORBIDDEN");
    expect(payload.error.hint).toBeTruthy();
  });

  it("domain errors carry the per-tool hint override (P2.2)", async () => {
    const { client } = await connectMcp();
    const result = await client.callTool({
      name: "list_tasks",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    expect(payload.error.code).toBe("INVALID_INPUT");
    expect(payload.error.hint).toBe(
      "Pass boardId (from list_boards) or columnId (from list_columns).",
    );
  });
});
