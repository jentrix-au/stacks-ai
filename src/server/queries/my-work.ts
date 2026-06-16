import { cache } from "react";
import type { BoardKind, Priority } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * P3.2 My Work: the caller's open tasks in one workspace, cross-board (cheap
 * via the denormalized Task.workspaceId), grouped by due-date urgency.
 * Archived tasks/columns/boards excluded. "Recently mentioned" joins as a
 * fourth group with P3.3, once @mention metadata exists on comments.
 */

export interface MyWorkTask {
  id: string;
  number: number;
  key: string;
  title: string;
  priority: Priority;
  dueAt: Date | null;
  updatedAt: Date;
  columnName: string;
  boardId: string;
  boardName: string;
  boardSlug: string;
  boardKind: BoardKind;
}

export interface MyWork {
  overdue: MyWorkTask[];
  dueToday: MyWorkTask[];
  assigned: MyWorkTask[];
  total: number;
}

/**
 * Mutually exclusive due-date buckets relative to `now` (server clock; UTC in
 * prod): overdue = due before today, dueToday = due some time today,
 * assigned = everything else I'm on (no due date or due later).
 */
export function partitionByDue<T extends { dueAt: Date | null }>(
  rows: T[],
  now: Date,
): { overdue: T[]; dueToday: T[]; assigned: T[] } {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  return {
    overdue: rows.filter((t) => t.dueAt !== null && t.dueAt < startOfToday),
    dueToday: rows.filter(
      (t) => t.dueAt !== null && t.dueAt >= startOfToday && t.dueAt < endOfToday,
    ),
    assigned: rows.filter((t) => t.dueAt === null || t.dueAt >= endOfToday),
  };
}

export const getMyWork = cache(
  async (userId: string, workspaceId: string): Promise<MyWork> => {
    const [workspace, tasks] = await Promise.all([
      db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { taskPrefix: true },
      }),
      db.task.findMany({
        where: {
          workspaceId,
          archivedAt: null,
          column: { archivedAt: null, board: { archivedAt: null } },
          assignees: { some: { userId } },
        },
        orderBy: [
          { dueAt: { sort: "asc", nulls: "last" } },
          { updatedAt: "desc" },
        ],
        select: {
          id: true,
          number: true,
          title: true,
          priority: true,
          dueAt: true,
          updatedAt: true,
          column: {
            select: {
              name: true,
              board: {
                select: { id: true, name: true, slug: true, kind: true },
              },
            },
          },
        },
      }),
    ]);

    const rows: MyWorkTask[] = tasks.map((t) => ({
      id: t.id,
      number: t.number,
      key: `${workspace.taskPrefix}-${t.number}`,
      title: t.title,
      priority: t.priority,
      dueAt: t.dueAt,
      updatedAt: t.updatedAt,
      columnName: t.column.name,
      boardId: t.column.board.id,
      boardName: t.column.board.name,
      boardSlug: t.column.board.slug,
      boardKind: t.column.board.kind,
    }));

    return { ...partitionByDue(rows, new Date()), total: rows.length };
  },
);
