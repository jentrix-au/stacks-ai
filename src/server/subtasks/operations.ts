import { revalidatePath } from "next/cache";
import { ActivityType } from "@prisma/client";

import { db } from "@/lib/db";
import { AuthzError, requireTaskAccess } from "@/lib/authz";
import { positionAfter, positionBefore, positionBetween } from "@/lib/position";
import { emitBoardEvent } from "@/lib/events";
import { withSource, type ActivitySource } from "@/server/activity";

import type {
  CreateSubtaskInput,
  DeleteSubtaskInput,
  RenameSubtaskInput,
  ReorderSubtaskInput,
  ToggleSubtaskInput,
} from "./schemas";

async function revalidateTaskById(taskId: string): Promise<string | null> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      column: {
        select: {
          boardId: true,
          board: {
            select: { slug: true, workspace: { select: { slug: true } } },
          },
        },
      },
    },
  });
  if (!task) return null;
  revalidatePath(
    `/${task.column.board.workspace.slug}/board/${task.column.board.slug}`,
  );
  return task.column.boardId;
}

async function requireSubtask(userId: string, subtaskId: string) {
  const subtask = await db.subtask.findUnique({
    where: { id: subtaskId },
    select: { id: true, taskId: true, title: true, completed: true },
  });
  if (!subtask) throw new AuthzError("Subtask not found", 404);
  await requireTaskAccess(userId, subtask.taskId);
  return subtask;
}

export async function createSubtask(
  userId: string,
  input: CreateSubtaskInput,
  source: ActivitySource = "ui",
): Promise<{ id: string; position: number }> {
  await requireTaskAccess(userId, input.taskId);
  const last = await db.subtask.findFirst({
    where: { taskId: input.taskId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = last ? positionAfter(last.position) : 1024;

  const [subtask] = await db.$transaction([
    db.subtask.create({
      data: { taskId: input.taskId, title: input.title, position },
      select: { id: true, position: true },
    }),
    db.activity.create({
      data: {
        taskId: input.taskId,
        actorId: userId,
        type: ActivityType.SUBTASK_ADDED,
        payload: withSource({ title: input.title }, source),
      },
    }),
  ]);
  const boardId = await revalidateTaskById(input.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "task.updated", { taskId: input.taskId });
  return subtask;
}

export async function toggleSubtask(
  userId: string,
  input: ToggleSubtaskInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const subtask = await requireSubtask(userId, input.subtaskId);
  await db.$transaction([
    db.subtask.update({
      where: { id: subtask.id },
      data: { completed: input.completed },
    }),
    ...(input.completed
      ? [
          db.activity.create({
            data: {
              taskId: subtask.taskId,
              actorId: userId,
              type: ActivityType.SUBTASK_COMPLETED,
              payload: withSource({ title: subtask.title }, source),
            },
          }),
        ]
      : []),
  ]);
  const boardId = await revalidateTaskById(subtask.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "task.updated", {
      taskId: subtask.taskId,
    });
}

export async function renameSubtask(
  userId: string,
  input: RenameSubtaskInput,
): Promise<void> {
  const subtask = await requireSubtask(userId, input.subtaskId);
  await db.subtask.update({
    where: { id: subtask.id },
    data: { title: input.title },
  });
  await revalidateTaskById(subtask.taskId);
}

export async function deleteSubtask(
  userId: string,
  input: DeleteSubtaskInput,
): Promise<void> {
  const subtask = await requireSubtask(userId, input.subtaskId);
  await db.subtask.delete({ where: { id: subtask.id } });
  const boardId = await revalidateTaskById(subtask.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "task.updated", {
      taskId: subtask.taskId,
    });
}

export async function reorderSubtask(
  userId: string,
  input: ReorderSubtaskInput,
): Promise<void> {
  const subtask = await requireSubtask(userId, input.subtaskId);

  const [before, after] = await Promise.all([
    input.beforeId
      ? db.subtask.findFirst({
          where: { id: input.beforeId, taskId: subtask.taskId },
          select: { position: true },
        })
      : Promise.resolve(null),
    input.afterId
      ? db.subtask.findFirst({
          where: { id: input.afterId, taskId: subtask.taskId },
          select: { position: true },
        })
      : Promise.resolve(null),
  ]);
  if (input.beforeId && !before)
    throw new AuthzError("beforeId is not a sibling of this subtask", 400);
  if (input.afterId && !after)
    throw new AuthzError("afterId is not a sibling of this subtask", 400);

  let position: number;
  if (before && after)
    position = positionBetween(before.position, after.position);
  else if (before) position = positionAfter(before.position);
  else if (after) position = positionBefore(after.position);
  else position = 1024;

  await db.subtask.update({
    where: { id: subtask.id },
    data: { position },
  });
  await revalidateTaskById(subtask.taskId);
}
