import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { AuthzError, requireBoardAccess } from "@/lib/authz";
import type {
  CreateSavedViewInput,
  DeleteSavedViewInput,
  ViewFilters,
} from "./schemas";

/**
 * Saved board views (P3.4). Board-preference state, not task-graph data:
 * no Activity rows, no realtime events, no MCP surface (see §9).
 */

async function revalidateBoard(boardId: string): Promise<void> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { slug: true, workspace: { select: { slug: true } } },
  });
  if (board)
    revalidatePath(`/${board.workspace.slug}/board/${board.slug}`);
}

export interface SavedViewSummary {
  id: string;
  name: string;
  filters: ViewFilters;
  shared: boolean;
  createdById: string;
}

/** The caller's own views plus shared ones, oldest first (stable chips). */
export async function listSavedViews(
  userId: string,
  boardId: string,
): Promise<SavedViewSummary[]> {
  await requireBoardAccess(userId, boardId);
  const views = await db.savedView.findMany({
    where: {
      boardId,
      OR: [{ createdById: userId }, { shared: true }],
    },
    orderBy: { createdAt: "asc" },
  });
  return views.map((v) => ({
    id: v.id,
    name: v.name,
    filters: v.filters as unknown as ViewFilters,
    shared: v.shared,
    createdById: v.createdById,
  }));
}

export async function createSavedView(
  userId: string,
  input: CreateSavedViewInput,
): Promise<SavedViewSummary> {
  await requireBoardAccess(userId, input.boardId);
  const view = await db.savedView.create({
    data: {
      boardId: input.boardId,
      name: input.name,
      filters: input.filters,
      shared: input.shared,
      createdById: userId,
    },
  });
  await revalidateBoard(input.boardId);
  return {
    id: view.id,
    name: view.name,
    filters: view.filters as unknown as ViewFilters,
    shared: view.shared,
    createdById: view.createdById,
  };
}

/** Creator deletes their own views; board ADMINs can also remove shared ones. */
export async function deleteSavedView(
  userId: string,
  input: DeleteSavedViewInput,
): Promise<void> {
  const view = await db.savedView.findUnique({
    where: { id: input.viewId },
    select: { id: true, boardId: true, createdById: true },
  });
  if (!view) throw new AuthzError("View not found", 404);
  await requireBoardAccess(userId, view.boardId);
  if (view.createdById !== userId) {
    await requireBoardAccess(userId, view.boardId, Role.ADMIN);
  }
  await db.savedView.delete({ where: { id: view.id } });
  await revalidateBoard(view.boardId);
}
