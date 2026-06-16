import { cache } from "react";
import { after } from "next/server";
import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import { notificationLink, sendNotificationEmail } from "@/lib/email";

/**
 * P3.3 watchers + notifications. Notification rows are written inside the
 * mutating op's transaction; immediate emails (mention/assign, per-user
 * `notifyEmail` toggle) go out post-response. Due-soon / SLA-breach types
 * arrive with the P3.6 cron sweep.
 */

export type NotificationType =
  | "assigned"
  | "mentioned"
  | "commented"
  | "due_soon"
  | "sla_breached";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Display snapshot stored on each notification (survives later renames). */
export interface NotificationPayload {
  actorName: string | null;
  taskKey: string;
  taskTitle: string;
  boardSlug: string;
  preview?: string;
}

export interface TaskNotifyContext {
  workspaceId: string;
  workspaceSlug: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  boardId: string;
  boardSlug: string;
  /** Empty string = system event (cron sweep): nobody is excluded. */
  actorId: string;
  actorName: string | null;
}

/** Idempotently subscribe users to a task's notifications. */
export async function ensureWatchers(
  tx: Tx,
  taskId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;
  await tx.taskWatcher.createMany({
    data: [...new Set(userIds)].map((userId) => ({ taskId, userId })),
    skipDuplicates: true,
  });
}

/**
 * Comment fan-out rules, pure for testability: mentioned users get
 * "mentioned"; remaining watchers get "commented"; the author gets nothing.
 */
export function resolveCommentRecipients(input: {
  authorId: string;
  mentions: string[];
  watchers: string[];
}): { mentioned: string[]; commented: string[] } {
  const mentioned = [...new Set(input.mentions)].filter(
    (id) => id !== input.authorId,
  );
  const mentionedSet = new Set(mentioned);
  const commented = [...new Set(input.watchers)].filter(
    (id) => id !== input.authorId && !mentionedSet.has(id),
  );
  return { mentioned, commented };
}

/** Write notification rows (skipping the actor). Returns the recipient ids. */
export async function createTaskNotifications(
  tx: Tx,
  ctx: TaskNotifyContext,
  type: NotificationType,
  recipients: string[],
  preview?: string,
): Promise<string[]> {
  const targets = [...new Set(recipients)].filter((id) => id !== ctx.actorId);
  if (targets.length === 0) return [];
  const payload: NotificationPayload = {
    actorName: ctx.actorName,
    taskKey: ctx.taskKey,
    taskTitle: ctx.taskTitle,
    boardSlug: ctx.boardSlug,
    ...(preview ? { preview } : {}),
  };
  await tx.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      workspaceId: ctx.workspaceId,
      taskId: ctx.taskId,
      type,
      payload: payload as unknown as Prisma.InputJsonValue,
    })),
  });
  return targets;
}

const EMAIL_SUBJECT: Partial<Record<NotificationType, string>> = {
  assigned: "assigned you",
  mentioned: "mentioned you",
};

/**
 * Send the immediate notification emails for one event NOW — mention/assign
 * only, honoring each recipient's `notifyEmail` toggle (filtered in the
 * query). Exported for tests; production code goes through
 * `queueNotificationEmails`.
 */
export async function sendNotificationEmailsNow(
  ctx: TaskNotifyContext,
  type: NotificationType,
  recipients: string[],
): Promise<void> {
  const verb = EMAIL_SUBJECT[type];
  if (!verb || recipients.length === 0) return;
  const users = await db.user.findMany({
    where: { id: { in: recipients }, notifyEmail: true },
    select: { email: true },
  });
  const actor = ctx.actorName ?? "A teammate";
  const link = notificationLink(ctx.workspaceSlug, ctx.boardSlug, ctx.taskId);
  for (const u of users) {
    await sendNotificationEmail({
      to: u.email,
      subject: `[${ctx.taskKey}] ${actor} ${verb}`,
      text: `${actor} ${verb} on ${ctx.taskKey} — ${ctx.taskTitle}.`,
      link,
    });
  }
}

/**
 * Queue immediate notification emails post-response (best-effort by design:
 * an email failure never breaks the mutation).
 */
export function queueNotificationEmails(
  ctx: TaskNotifyContext,
  type: NotificationType,
  recipients: string[],
): void {
  if (recipients.length === 0 || !EMAIL_SUBJECT[type]) return;
  const send = () => sendNotificationEmailsNow(ctx, type, recipients);
  try {
    after(send);
  } catch {
    // Outside a Next request scope (tests, scripts): run inline, detached.
    void send().catch((e) => console.error("notification email failed", e));
  }
}

/** Task display context needed by every notify call site. */
export async function getTaskNotifyContext(
  tx: Tx,
  taskId: string,
  actorId: string,
): Promise<TaskNotifyContext | null> {
  const [task, actor] = await Promise.all([
    tx.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        number: true,
        title: true,
        workspaceId: true,
        workspace: { select: { slug: true, taskPrefix: true } },
        column: { select: { board: { select: { id: true, slug: true } } } },
      },
    }),
    actorId
      ? tx.user.findUnique({
          where: { id: actorId },
          select: { name: true, email: true },
        })
      : Promise.resolve(null),
  ]);
  if (!task) return null;
  return {
    workspaceId: task.workspaceId,
    workspaceSlug: task.workspace.slug,
    taskId: task.id,
    taskKey: `${task.workspace.taskPrefix}-${task.number}`,
    taskTitle: task.title,
    boardId: task.column.board.id,
    boardSlug: task.column.board.slug,
    actorId,
    actorName: actor?.name ?? actor?.email ?? null,
  };
}

// ---------------------------------------------------------------------------
// Reads + inbox mutations (user-private; no MCP surface by design).
// ---------------------------------------------------------------------------

export const unreadNotificationCount = cache(
  async (userId: string, workspaceId: string): Promise<number> => {
    return db.notification.count({
      where: { userId, workspaceId, readAt: null },
    });
  },
);

export const listMyNotifications = cache(
  async (userId: string, workspaceId: string, take = 50) => {
    return db.notification.findMany({
      where: { userId, workspaceId },
      orderBy: { createdAt: "desc" },
      take,
    });
  },
);

export type MyNotification = Awaited<
  ReturnType<typeof listMyNotifications>
>[number];

/** Mark specific notifications read — only the caller's own rows. */
export async function markNotificationsRead(
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.notification.updateMany({
    where: { id: { in: ids }, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(
  userId: string,
  workspaceId: string,
): Promise<void> {
  await db.notification.updateMany({
    where: { userId, workspaceId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function setNotifyEmail(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { notifyEmail: enabled },
  });
}
