import { cache } from "react";
import { db } from "@/lib/db";

/**
 * All non-archived tasks in a workspace, as candidates for the task-link
 * picker (any board kind — links can span boards). Lean summaries with the
 * parent board so cross-board edges read clearly in the UI.
 */
export const listWorkspaceLinkTargets = cache(async (workspaceId: string) => {
  const rows = await db.task.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      column: { archivedAt: null, board: { archivedAt: null } },
    },
    orderBy: { number: "desc" },
    select: {
      id: true,
      number: true,
      title: true,
      column: {
        select: {
          board: { select: { id: true, name: true, slug: true, kind: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    taskId: r.id,
    number: r.number,
    title: r.title,
    board: r.column.board,
  }));
});

export type WorkspaceLinkTarget = Awaited<
  ReturnType<typeof listWorkspaceLinkTargets>
>[number];
