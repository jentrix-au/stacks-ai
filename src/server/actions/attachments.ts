"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActivityType, AttachmentStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { requireTaskAccess, AuthzError } from "@/lib/authz";
import { deleteObject } from "@/lib/r2";
import { emitBoardEvent } from "@/lib/events";

const Finalize = z.object({ attachmentId: z.string().min(1) });

export async function finalizeUpload(input: z.infer<typeof Finalize>) {
  const user = await requireUser();
  const data = Finalize.parse(input);

  const attachment = await db.attachment.findUnique({
    where: { id: data.attachmentId },
    select: { id: true, taskId: true, uploaderId: true, name: true },
  });
  if (!attachment) throw new AuthzError("Attachment not found", 404);
  if (attachment.uploaderId !== user.id)
    throw new AuthzError("Not your upload");
  if (!attachment.taskId) throw new AuthzError("Attachment has no task", 400);

  await requireTaskAccess(user.id, attachment.taskId);

  await db.$transaction([
    db.attachment.update({
      where: { id: attachment.id },
      data: { status: AttachmentStatus.READY },
    }),
    db.activity.create({
      data: {
        taskId: attachment.taskId,
        actorId: user.id,
        type: ActivityType.ATTACHMENT_ADDED,
        payload: { name: attachment.name },
      },
    }),
  ]);

  const task = await db.task.findUnique({
    where: { id: attachment.taskId },
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
  if (task) {
    revalidatePath(
      `/${task.column.board.workspace.slug}/board/${task.column.board.slug}`,
    );
    await emitBoardEvent(task.column.boardId, "attachment.created", {
      taskId: attachment.taskId,
      attachmentId: attachment.id,
    });
  }
}

const Remove = z.object({ attachmentId: z.string().min(1) });

export async function removeAttachment(input: z.infer<typeof Remove>) {
  const user = await requireUser();
  const data = Remove.parse(input);

  const attachment = await db.attachment.findUnique({
    where: { id: data.attachmentId },
  });
  if (!attachment) throw new AuthzError("Attachment not found", 404);
  if (attachment.taskId) {
    await requireTaskAccess(user.id, attachment.taskId);
  }
  if (attachment.uploaderId !== user.id) {
    throw new AuthzError("Not your attachment");
  }

  if (attachment.taskId) {
    await db.$transaction([
      db.attachment.delete({ where: { id: attachment.id } }),
      db.activity.create({
        data: {
          taskId: attachment.taskId,
          actorId: user.id,
          type: ActivityType.ATTACHMENT_REMOVED,
          payload: { name: attachment.name },
        },
      }),
    ]);

    const task = await db.task.findUnique({
      where: { id: attachment.taskId },
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
    if (task) {
      revalidatePath(
        `/${task.column.board.workspace.slug}/board/${task.column.board.slug}`,
      );
      await emitBoardEvent(task.column.boardId, "attachment.removed", {
        taskId: attachment.taskId,
        attachmentId: attachment.id,
      });
    }
  } else {
    await db.attachment.delete({ where: { id: attachment.id } });
  }

  try {
    await deleteObject(attachment.r2Key);
  } catch (err) {
    console.warn("[r2] delete failed", err);
  }
}
