import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { AuthzError, requireBoardAccess } from "@/lib/authz";
import { emitBoardEvent } from "@/lib/events";

import type {
  CreateLabelInput,
  DeleteLabelInput,
  UpdateLabelInput,
} from "./schemas";

async function revalidateBoardById(boardId: string) {
  const board = await db.board.findUnique({
    where: { id: boardId },
    include: { workspace: { select: { slug: true } } },
  });
  if (board) revalidatePath(`/${board.workspace.slug}/board/${board.slug}`);
}

/** Idempotent on name: creating an existing (boardId, name) returns it. */
export async function createLabel(userId: string, input: CreateLabelInput) {
  await requireBoardAccess(userId, input.boardId);

  const existing = await db.label.findUnique({
    where: { boardId_name: { boardId: input.boardId, name: input.name } },
  });
  if (existing) return existing;

  const label = await db.label.create({
    data: { boardId: input.boardId, name: input.name, color: input.color },
  });
  await emitBoardEvent(input.boardId, "label.created", {
    labelId: label.id,
  });
  await revalidateBoardById(input.boardId);
  return label;
}

export async function updateLabel(userId: string, input: UpdateLabelInput) {
  const label = await db.label.findUnique({
    where: { id: input.labelId },
    select: { boardId: true },
  });
  if (!label) throw new AuthzError("Label not found", 404);
  await requireBoardAccess(userId, label.boardId);

  const updated = await db.label.update({
    where: { id: input.labelId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
  await emitBoardEvent(label.boardId, "label.updated", {
    labelId: updated.id,
  });
  await revalidateBoardById(label.boardId);
  return updated;
}

export async function deleteLabel(
  userId: string,
  input: DeleteLabelInput,
): Promise<void> {
  const label = await db.label.findUnique({
    where: { id: input.labelId },
    select: { boardId: true },
  });
  if (!label) throw new AuthzError("Label not found", 404);
  await requireBoardAccess(userId, label.boardId);

  await db.label.delete({ where: { id: input.labelId } });
  await emitBoardEvent(label.boardId, "label.deleted", {
    labelId: input.labelId,
  });
  await revalidateBoardById(label.boardId);
}
