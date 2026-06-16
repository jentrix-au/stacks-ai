import { describe, expect, it, vi } from "vitest";

// Token-cost regression (P2.2 acceptance): a concise list_tasks page must
// stay cheap. Budget: ≤400 chars/task (≈100 tokens) and ≤20k chars for a
// full 50-task page. If this test starts failing, the concise row grew —
// shrink it or consciously raise the budget here AND in UPGRADE-PLAN §9.

const { dbMock } = vi.hoisted(() => {
  const TAKE = 50;
  const TOTAL = 312;
  const tasks = Array.from({ length: TAKE + 1 }, (_, i) => ({
    id: `cmqtask${String(i).padStart(17, "0")}`,
    number: 100 + i,
    title: `Implement audit logging for workspace events #${i}`,
    columnId: "cmqcolumn000000000000001",
    priority: "MEDIUM",
    dueAt: new Date("2026-07-01T12:00:00.000Z"),
    archivedAt: null,
    position: (i + 1) * 1024,
    createdAt: new Date("2026-06-01T09:30:00.000Z"),
    updatedAt: new Date("2026-06-10T17:45:00.000Z"),
    labels: [
      { labelId: "cmqlabel0000000000000001" },
      { labelId: "cmqlabel0000000000000002" },
    ],
    assignees: [{ userId: "cmquser00000000000000001" }],
    deal: null,
    bugReport: null,
    ticket: null,
    initiative: null,
    _count: { outgoingLinks: 1, incomingLinks: 2 },
  }));
  return {
    dbMock: {
      board: {
        findFirst: vi.fn(async () => ({
          id: "board_1",
          workspaceId: "ws_1",
        })),
        findUniqueOrThrow: vi.fn(async () => ({
          name: "Engineering Sprint Board",
          kind: "TASKS",
        })),
      },
      workspaceMember: {
        findUnique: vi.fn(async () => ({ role: "MEMBER" })),
      },
      workspace: {
        findUniqueOrThrow: vi.fn(async () => ({ taskPrefix: "ENG" })),
      },
      column: {
        findMany: vi.fn(async () => [
          { id: "cmqcolumn000000000000001", name: "In progress" },
        ]),
      },
      task: {
        count: vi.fn(async () => TOTAL),
        findMany: vi.fn(async () => tasks),
      },
    },
  };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

import { listMcpTasks } from "@/server/queries/mcp-context";

describe("concise list_tasks token cost", () => {
  it("stays within the page budget and carries a truncation notice", async () => {
    const result = await listMcpTasks("user_1", { boardId: "board_1" });

    expect(result.tasks).toHaveLength(50);
    expect(result.totalCount).toBe(312);
    expect(result.nextCursor).not.toBeNull();
    expect(result.notice).toMatch(/50 of 312/);
    // Semantic names next to ids:
    expect(result.boardName).toBe("Engineering Sprint Board");
    expect(result.tasks[0].columnName).toBe("In progress");
    expect(result.tasks[0].key).toBe("ENG-100");

    const pageChars = JSON.stringify(result).length;
    const perTaskChars = JSON.stringify(result.tasks).length / 50;
    expect(perTaskChars).toBeLessThanOrEqual(400);
    expect(pageChars).toBeLessThanOrEqual(20_000);
  });

  it("concise rows omit detailed-only fields; detailed keeps them", async () => {
    const concise = await listMcpTasks("user_1", { boardId: "board_1" });
    const detailed = await listMcpTasks("user_1", {
      boardId: "board_1",
      responseFormat: "detailed",
    });

    expect(concise.tasks[0]).not.toHaveProperty("labelIds");
    expect(concise.tasks[0]).not.toHaveProperty("links");
    expect(detailed.tasks[0]).toHaveProperty("labelIds");
    expect(detailed.tasks[0]).toHaveProperty("links");
    expect(JSON.stringify(detailed).length).toBeGreaterThan(
      JSON.stringify(concise).length,
    );
  });
});
