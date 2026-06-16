import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, transaction } = vi.hoisted(() => {
  const transaction = vi.fn(async () => []);
  return {
    transaction,
    dbMock: {
      task: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(() => ({ kind: "task.update" })),
      },
      workspaceMember: { findUnique: vi.fn() },
      activity: { create: vi.fn(() => ({ kind: "activity.create" })) },
      $transaction: transaction,
    },
  };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({
  emitBoardEvent: vi.fn(async () => {}),
}));

import { StaleWriteError } from "@/lib/authz";
import { updateTask } from "./operations";

const TASK_ACCESS_ROW = {
  id: "task_1",
  columnId: "col_1",
  column: { boardId: "board_1", board: { workspaceId: "ws_1" } },
};

const CURRENT = {
  id: "task_1",
  title: "Current title",
  description: null,
  priority: "HIGH",
  dueAt: null,
  columnId: "col_1",
  position: 1024,
  updatedAt: new Date("2026-06-12T10:00:00.000Z"),
};

// task.findUnique serves two callers: the freshness check (select.updatedAt)
// and revalidateTaskById (select.column). Dispatch on the select shape.
function wireFindUnique() {
  dbMock.task.findUnique.mockImplementation(
    async (args: { select?: Record<string, unknown> }) => {
      if (args.select?.updatedAt) return CURRENT;
      return {
        column: {
          boardId: "board_1",
          board: { slug: "b", workspace: { slug: "w" } },
        },
      };
    },
  );
}

describe("updateTask expectedUpdatedAt (P2.4 acceptance)", () => {
  beforeEach(() => {
    dbMock.task.findFirst.mockReset();
    dbMock.task.findUnique.mockReset();
    dbMock.workspaceMember.findUnique.mockReset();
    transaction.mockClear();
    dbMock.task.findFirst.mockResolvedValue(TASK_ACCESS_ROW);
    dbMock.workspaceMember.findUnique.mockResolvedValue({ role: "MEMBER" });
    wireFindUnique();
  });

  it("stale update rejects with CONFLICT carrying the current entity; nothing is written", async () => {
    const err = await updateTask("user_1", {
      taskId: "task_1",
      title: "New title",
      expectedUpdatedAt: "2026-06-12T09:00:00.000Z", // older than CURRENT
    }).catch((e) => e);

    expect(err).toBeInstanceOf(StaleWriteError);
    expect((err as StaleWriteError).status).toBe(409);
    const current = (err as StaleWriteError).current as Record<
      string,
      unknown
    >;
    expect(current.title).toBe("Current title");
    expect(current.updatedAt).toBe("2026-06-12T10:00:00.000Z");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("matching expectedUpdatedAt proceeds with the write", async () => {
    await updateTask("user_1", {
      taskId: "task_1",
      title: "New title",
      expectedUpdatedAt: "2026-06-12T10:00:00.000Z",
    });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("omitting expectedUpdatedAt keeps last-write-wins (no freshness read)", async () => {
    await updateTask("user_1", { taskId: "task_1", title: "New title" });
    expect(transaction).toHaveBeenCalledOnce();
    // findUnique only called by revalidateTaskById, never with updatedAt select
    const freshnessCalls = dbMock.task.findUnique.mock.calls.filter(
      (c) =>
        (c[0] as { select?: Record<string, unknown> } | undefined)?.select
          ?.updatedAt,
    );
    expect(freshnessCalls).toHaveLength(0);
  });
});
