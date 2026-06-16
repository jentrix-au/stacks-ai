import { revalidatePath } from "next/cache";
import { ActivityType } from "@prisma/client";

import { db } from "@/lib/db";
import { AuthzError, requireTaskAccess } from "@/lib/authz";
import { emitBoardEvent } from "@/lib/events";
import { withSource, type ActivitySource } from "@/server/activity";
import {
  createTaskNotifications,
  ensureWatchers,
  getTaskNotifyContext,
  queueNotificationEmails,
  resolveCommentRecipients,
} from "@/server/notifications";

import type {
  CreateCommentInput,
  DeleteCommentInput,
  ListCommentsInput,
  UpdateCommentInput,
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

/**
 * Load a comment + verify the caller can act on it. Edits/deletes are
 * author-only (any member of the workspace can read).
 */
async function requireOwnComment(userId: string, commentId: string) {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, taskId: true },
  });
  if (!comment) throw new AuthzError("Comment not found", 404);
  await requireTaskAccess(userId, comment.taskId);
  if (comment.authorId !== userId)
    throw new AuthzError("Not your comment — only the author can change it");
  return comment;
}

export async function createComment(
  userId: string,
  input: CreateCommentInput,
  source: ActivitySource = "ui",
): Promise<{ id: string }> {
  const task = await requireTaskAccess(userId, input.taskId);

  // Mentions must be members of the task's workspace; reject unknowns so a
  // typo'd id fails loudly instead of notifying nobody.
  const mentions = [...new Set(input.mentions ?? [])];
  if (mentions.length > 0) {
    const members = await db.workspaceMember.findMany({
      where: {
        workspaceId: task.column.board.workspaceId,
        userId: { in: mentions },
      },
      select: { userId: true },
    });
    if (members.length !== mentions.length) {
      throw new AuthzError(
        "One or more mentioned users are not members of this workspace",
        400,
      );
    }
  }

  // commentId in the payload lets the comment thread attribute MCP-created
  // comments ("via 🤖 <token>") by joining COMMENT_CREATED activities.
  const { comment, notify } = await db.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        taskId: input.taskId,
        authorId: userId,
        body: input.body,
        mentions,
      },
      select: { id: true },
    });
    await tx.activity.create({
      data: {
        taskId: input.taskId,
        actorId: userId,
        type: ActivityType.COMMENT_CREATED,
        payload: withSource({ commentId: created.id }, source),
      },
    });

    // Watch + notify (P3.3): author auto-watches; mentioned users get
    // "mentioned", remaining watchers "commented"; actor never notified.
    await ensureWatchers(tx, input.taskId, [userId]);
    const watchers = await tx.taskWatcher.findMany({
      where: { taskId: input.taskId },
      select: { userId: true },
    });
    const recipients = resolveCommentRecipients({
      authorId: userId,
      mentions,
      watchers: watchers.map((w) => w.userId),
    });
    const ctx = await getTaskNotifyContext(tx, input.taskId, userId);
    let mentionedNotified: string[] = [];
    if (ctx) {
      const preview = input.body.slice(0, 140);
      mentionedNotified = await createTaskNotifications(
        tx,
        ctx,
        "mentioned",
        recipients.mentioned,
        preview,
      );
      await createTaskNotifications(
        tx,
        ctx,
        "commented",
        recipients.commented,
        preview,
      );
    }
    return { comment: created, notify: { ctx, mentionedNotified } };
  });
  if (notify.ctx)
    queueNotificationEmails(notify.ctx, "mentioned", notify.mentionedNotified);
  const boardId = await revalidateTaskById(input.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "comment.created", {
      taskId: input.taskId,
      commentId: comment.id,
    });
  return { id: comment.id };
}

export async function updateComment(
  userId: string,
  input: UpdateCommentInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const comment = await requireOwnComment(userId, input.commentId);
  await db.$transaction([
    db.comment.update({
      where: { id: comment.id },
      data: { body: input.body, editedAt: new Date() },
    }),
    db.activity.create({
      data: {
        taskId: comment.taskId,
        actorId: userId,
        type: ActivityType.COMMENT_EDITED,
        payload: withSource({}, source),
      },
    }),
  ]);
  const boardId = await revalidateTaskById(comment.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "comment.updated", {
      taskId: comment.taskId,
      commentId: comment.id,
    });
}

export async function deleteComment(
  userId: string,
  input: DeleteCommentInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const comment = await requireOwnComment(userId, input.commentId);
  await db.$transaction([
    db.comment.delete({ where: { id: comment.id } }),
    db.activity.create({
      data: {
        taskId: comment.taskId,
        actorId: userId,
        type: ActivityType.COMMENT_DELETED,
        payload: withSource({}, source),
      },
    }),
  ]);
  const boardId = await revalidateTaskById(comment.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "comment.deleted", {
      taskId: comment.taskId,
      commentId: comment.id,
    });
}

/** MCP-shaped comment list (ISO dates, wrapped). UI reads keep their own query. */
export async function listComments(userId: string, input: ListCommentsInput) {
  await requireTaskAccess(userId, input.taskId);
  const comments = await db.comment.findMany({
    where: { taskId: input.taskId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      editedAt: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  });
  return {
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      editedAt: c.editedAt ? c.editedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      author: c.author,
    })),
  };
}
