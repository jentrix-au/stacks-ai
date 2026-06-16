import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { AuthzError, requireBoardAccess } from "@/lib/authz";
import { positionAfter, positionBetween } from "@/lib/position";
import { emitBoardEvent } from "@/lib/events";

import type {
  ArchiveColumnInput,
  CreateColumnInput,
  MoveColumnInput,
  RenameColumnInput,
} from "./schemas";

async function revalidateBoardById(boardId: string) {
  const board = await db.board.findUnique({
    where: { id: boardId },
    include: { workspace: { select: { slug: true } } },
  });
  if (board) revalidatePath(`/${board.workspace.slug}/board/${board.slug}`);
}

async function requireColumn(userId: string, columnId: string) {
  const column = await db.column.findUnique({
    where: { id: columnId },
    select: { id: true, boardId: true, archivedAt: true },
  });
  if (!column || column.archivedAt)
    throw new AuthzError("Column not found", 404);
  await requireBoardAccess(userId, column.boardId);
  return column;
}

export async function createColumn(
  userId: string,
  input: CreateColumnInput,
): Promise<{ id: string; name: string; position: number }> {
  await requireBoardAccess(userId, input.boardId);

  const last = await db.column.findFirst({
    where: { boardId: input.boardId, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = last ? positionAfter(last.position) : 1024;

  const column = await db.column.create({
    data: { boardId: input.boardId, name: input.name, position },
    select: { id: true, name: true, position: true },
  });
  await emitBoardEvent(input.boardId, "column.created", {
    columnId: column.id,
  });
  await revalidateBoardById(input.boardId);
  return column;
}

export async function renameColumn(
  userId: string,
  input: RenameColumnInput,
): Promise<void> {
  const column = await requireColumn(userId, input.columnId);
  await db.column.update({
    where: { id: column.id },
    data: { name: input.name },
  });
  await emitBoardEvent(column.boardId, "column.updated", {
    columnId: column.id,
  });
  await revalidateBoardById(column.boardId);
}

export async function moveColumn(
  userId: string,
  input: MoveColumnInput,
): Promise<void> {
  const column = await requireColumn(userId, input.columnId);

  const [before, after] = await Promise.all([
    input.beforeColumnId
      ? db.column.findFirst({
          where: {
            id: input.beforeColumnId,
            boardId: column.boardId,
            archivedAt: null,
          },
          select: { position: true },
        })
      : Promise.resolve(null),
    input.afterColumnId
      ? db.column.findFirst({
          where: {
            id: input.afterColumnId,
            boardId: column.boardId,
            archivedAt: null,
          },
          select: { position: true },
        })
      : Promise.resolve(null),
  ]);
  if (input.beforeColumnId && !before)
    throw new AuthzError("beforeColumnId is not in this board", 400);
  if (input.afterColumnId && !after)
    throw new AuthzError("afterColumnId is not in this board", 400);

  let position: number;
  if (before && after)
    position = positionBetween(before.position, after.position);
  else if (before) position = positionAfter(before.position);
  else if (after) position = after.position - 1024;
  else position = 1024;

  await db.column.update({
    where: { id: column.id },
    data: { position },
  });
  await emitBoardEvent(column.boardId, "column.moved", {
    columnId: column.id,
  });
  await revalidateBoardById(column.boardId);
}

export async function archiveColumn(
  userId: string,
  input: ArchiveColumnInput,
): Promise<void> {
  const column = await requireColumn(userId, input.columnId);
  await db.column.update({
    where: { id: column.id },
    data: { archivedAt: new Date() },
  });
  await emitBoardEvent(column.boardId, "column.archived", {
    columnId: column.id,
  });
  await revalidateBoardById(column.boardId);
}
