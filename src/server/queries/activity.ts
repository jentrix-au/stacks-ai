import { cache } from "react";
import { db } from "@/lib/db";

export async function listTaskActivity(taskId: string) {
  return db.activity.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actor: { select: { id: true, name: true, email: true, image: true } },
    },
  });
}

export type TaskActivity = Awaited<ReturnType<typeof listTaskActivity>>[number];

/**
 * Workspace-wide recent activity for the home digest (P3.2). Cross-board via
 * the denormalized Task.workspaceId; archived tasks/columns/boards excluded.
 */
export const listWorkspaceActivity = cache(
  async (workspaceId: string, take = 8) => {
    return db.activity.findMany({
      where: {
        task: {
          workspaceId,
          archivedAt: null,
          column: { archivedAt: null, board: { archivedAt: null } },
        },
      },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        actor: { select: { id: true, name: true, email: true } },
        task: {
          select: {
            id: true,
            number: true,
            title: true,
            column: {
              select: { board: { select: { name: true, slug: true } } },
            },
          },
        },
      },
    });
  },
);

export type WorkspaceActivity = Awaited<
  ReturnType<typeof listWorkspaceActivity>
>[number];
