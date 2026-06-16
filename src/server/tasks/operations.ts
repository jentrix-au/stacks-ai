import { revalidatePath } from "next/cache";
import { ActivityType, BoardKind, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  AuthzError,
  requireBoardAccess,
  requireTaskAccess,
  requireWorkspaceRole,
} from "@/lib/authz";
import { assertFresh } from "@/lib/freshness";
import { positionAfter, positionBefore, positionBetween } from "@/lib/position";
import { emitBoardEvent, scheduleAfterResponse } from "@/lib/events";
import { dispatchAutomationEvent } from "@/server/automations/engine";

import { withSource, type ActivitySource } from "@/server/activity";
import { findCyclePath, type LinkKind } from "@/server/links/graph";
import {
  createTaskNotifications,
  ensureWatchers,
  getTaskNotifyContext,
  queueNotificationEmails,
} from "@/server/notifications";

import type {
  AddTaskLinkInput,
  ArchiveTaskInput,
  BulkCreateTasksInput,
  BulkMoveTasksInput,
  BulkUpdateTasksInput,
  CreateTaskInput,
  LinkTicketContactInput,
  ListInitiativesInput,
  ListTaskLinksInput,
  MoveTaskInput,
  RemoveTaskLinkInput,
  SetDealContactsInput,
  SetTaskAssigneesInput,
  SetTaskLabelsInput,
  UpdateBugReportInput,
  UpdateDealInput,
  UpdateInitiativeInput,
  UpdateTaskInput,
  UpdateTicketInput,
} from "./schemas";

export type { ActivitySource } from "@/server/activity";

async function revalidateTaskById(taskId: string): Promise<string | null> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      column: {
        select: {
          boardId: true,
          board: {
            select: {
              slug: true,
              workspace: { select: { slug: true } },
            },
          },
        },
      },
    },
  });
  if (!task) return null;
  const ws = task.column.board.workspace.slug;
  const b = task.column.board.slug;
  revalidatePath(`/${ws}/board/${b}`);
  return task.column.boardId;
}

/**
 * Allocate `count` consecutive per-workspace task numbers, returning the
 * first. Single atomic upsert: the row lock serializes concurrent creates in
 * the same workspace, and the insert branch self-heals a missing counter row
 * (e.g. a workspace created before counters existed).
 */
async function allocateTaskNumbers(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  count = 1,
): Promise<number> {
  const rows = await tx.$queryRaw<{ first: number }[]>`
    INSERT INTO "WorkspaceCounter" ("workspaceId", "nextTaskNumber")
    VALUES (${workspaceId}, ${count + 1})
    ON CONFLICT ("workspaceId")
    DO UPDATE SET "nextTaskNumber" = "WorkspaceCounter"."nextTaskNumber" + ${count}
    RETURNING "nextTaskNumber" - ${count} AS "first"`;
  return rows[0].first;
}


/** Event patches reuse the activity payload, minus its taskId key. */
function eventPatch(
  activityPayload: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(activityPayload).filter(([k]) => k !== "taskId"),
  );
}

export async function createTask(
  userId: string,
  input: CreateTaskInput,
  source: ActivitySource = "ui",
): Promise<{ id: string; number: number; key: string }> {
  const column = await db.column.findFirst({
    where: {
      id: input.columnId,
      archivedAt: null,
      board: { archivedAt: null },
    },
    select: {
      id: true,
      boardId: true,
      board: {
        select: {
          kind: true,
          workspaceId: true,
          workspace: { select: { taskPrefix: true } },
        },
      },
    },
  });
  if (!column) throw new AuthzError("Column not found", 404);
  await requireBoardAccess(userId, column.boardId);

  const last = await db.task.findFirst({
    where: { columnId: column.id, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = last ? positionAfter(last.position) : 1024;

  const task = await db.$transaction(async (tx) => {
    const number = await allocateTaskNumbers(tx, column.board.workspaceId);
    return tx.task.create({
      data: {
        columnId: column.id,
        workspaceId: column.board.workspaceId,
        number,
        title: input.title,
        description: input.description,
        priority: input.priority ?? undefined,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        position,
        createdById: userId,
        activities: {
          create: {
            actorId: userId,
            type: ActivityType.TASK_CREATED,
            payload: withSource({}, source),
          },
        },
        // Creator auto-watches their task (P3.3).
        watchers: { create: { userId } },
        // Auto-create the per-kind sidecar so the UI/MCP can edit it without
        // an upsert path.
        ...(column.board.kind === BoardKind.CRM
          ? { deal: { create: {} } }
          : column.board.kind === BoardKind.BUGS
            ? { bugReport: { create: {} } }
            : column.board.kind === BoardKind.SUPPORT
              ? { ticket: { create: {} } }
              : column.board.kind === BoardKind.ROADMAP
                ? { initiative: { create: {} } }
                : {}),
      },
      select: { id: true, number: true },
    });
  });
  const boardId = await revalidateTaskById(task.id);
  if (boardId)
    await emitBoardEvent(boardId, "task.created", { taskId: task.id });
  // Automations run post-commit, post-response (P3.7).
  scheduleAfterResponse(() =>
    dispatchAutomationEvent({
      kind: "task.created",
      taskId: task.id,
      boardId: column.boardId,
      workspaceId: column.board.workspaceId,
      source,
    }),
  );
  return {
    id: task.id,
    number: task.number,
    key: `${column.board.workspace.taskPrefix}-${task.number}`,
  };
}

/**
 * Enforce an `expectedUpdatedAt` precondition on a task (P2.4). The CONFLICT
 * embeds the task's current scalars so the agent can merge without a read.
 */
async function assertTaskFresh(
  taskId: string,
  expected: string | null | undefined,
): Promise<void> {
  if (!expected) return;
  const current = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      dueAt: true,
      columnId: true,
      position: true,
      updatedAt: true,
    },
  });
  if (!current) return; // authz already ran; let the write surface NOT_FOUND
  assertFresh(expected, current.updatedAt, {
    ...current,
    dueAt: current.dueAt ? current.dueAt.toISOString() : null,
    updatedAt: current.updatedAt.toISOString(),
  });
}

export async function updateTask(
  userId: string,
  input: UpdateTaskInput,
  source: ActivitySource = "ui",
): Promise<void> {
  await requireTaskAccess(userId, input.taskId);
  await assertTaskFresh(input.taskId, input.expectedUpdatedAt);

  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined)
    updateData.description = input.description;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.dueAt !== undefined)
    updateData.dueAt = input.dueAt === null ? null : new Date(input.dueAt);

  const activityPayload: Record<string, unknown> = { taskId: input.taskId };
  if (input.title !== undefined) activityPayload.title = input.title;
  if (input.description !== undefined)
    activityPayload.description = input.description;
  if (input.priority !== undefined) activityPayload.priority = input.priority;
  if (input.dueAt !== undefined) activityPayload.dueAt = input.dueAt;

  await db.$transaction([
    db.task.update({ where: { id: input.taskId }, data: updateData }),
    db.activity.create({
      data: {
        taskId: input.taskId,
        actorId: userId,
        type: ActivityType.TASK_UPDATED,
        payload: withSource(activityPayload, source),
      },
    }),
  ]);
  const boardId = await revalidateTaskById(input.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "task.updated", { taskId: input.taskId });
}

export async function moveTask(
  userId: string,
  input: MoveTaskInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const task = await requireTaskAccess(userId, input.taskId);
  await assertTaskFresh(input.taskId, input.expectedUpdatedAt);
  const toColumn = await db.column.findFirst({
    where: { id: input.toColumnId, archivedAt: null },
    select: { id: true, boardId: true },
  });
  if (!toColumn) throw new AuthzError("Target column not found", 404);
  if (toColumn.boardId !== task.column.boardId)
    throw new AuthzError("Cannot move task across boards");

  const [before, after] = await Promise.all([
    input.beforeTaskId
      ? db.task.findFirst({
          where: {
            id: input.beforeTaskId,
            columnId: toColumn.id,
            archivedAt: null,
          },
          select: { position: true },
        })
      : Promise.resolve(null),
    input.afterTaskId
      ? db.task.findFirst({
          where: {
            id: input.afterTaskId,
            columnId: toColumn.id,
            archivedAt: null,
          },
          select: { position: true },
        })
      : Promise.resolve(null),
  ]);
  if (input.beforeTaskId && !before)
    throw new AuthzError("beforeTaskId is not in the target column", 400);
  if (input.afterTaskId && !after)
    throw new AuthzError("afterTaskId is not in the target column", 400);

  let position: number;
  if (before && after)
    position = positionBetween(before.position, after.position);
  else if (before) position = positionAfter(before.position);
  else if (after) position = positionBefore(after.position);
  else {
    const last = await db.task.findFirst({
      where: { columnId: toColumn.id, archivedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    position = last ? positionAfter(last.position) : 1024;
  }

  const fromColumnId = task.columnId;
  await db.$transaction([
    db.task.update({
      where: { id: input.taskId },
      data: { columnId: toColumn.id, position },
    }),
    db.activity.create({
      data: {
        taskId: input.taskId,
        actorId: userId,
        type: ActivityType.TASK_MOVED,
        payload: withSource({ from: fromColumnId, to: toColumn.id }, source),
      },
    }),
  ]);
  const boardId = await revalidateTaskById(input.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "task.moved", {
      taskId: input.taskId,
      toColumnId: toColumn.id,
    });
  scheduleAfterResponse(() =>
    dispatchAutomationEvent({
      kind: "task.moved_to_column",
      taskId: input.taskId,
      boardId: toColumn.boardId,
      workspaceId: task.column.board.workspaceId,
      columnId: toColumn.id,
      source,
    }),
  );
}

export async function archiveTask(
  userId: string,
  input: ArchiveTaskInput,
  source: ActivitySource = "ui",
): Promise<void> {
  await requireTaskAccess(userId, input.taskId);
  await db.$transaction([
    db.task.update({
      where: { id: input.taskId },
      data: { archivedAt: new Date() },
    }),
    db.activity.create({
      data: {
        taskId: input.taskId,
        actorId: userId,
        type: ActivityType.TASK_ARCHIVED,
        payload: withSource({}, source),
      },
    }),
  ]);
  const boardId = await revalidateTaskById(input.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "task.updated", { taskId: input.taskId });
}

export async function setTaskLabels(
  userId: string,
  input: SetTaskLabelsInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const task = await requireTaskAccess(userId, input.taskId);

  if (input.labelIds.length > 0) {
    const validLabels = await db.label.findMany({
      where: { id: { in: input.labelIds }, boardId: task.column.boardId },
      select: { id: true },
    });
    if (validLabels.length !== input.labelIds.length) {
      throw new AuthzError(
        "One or more labels do not belong to this task's board",
        400,
      );
    }
  }

  // Diff so label.added automation triggers fire only for NEW labels.
  const current = await db.taskLabel.findMany({
    where: { taskId: input.taskId },
    select: { labelId: true },
  });
  const currentIds = new Set(current.map((l) => l.labelId));
  const addedLabelIds = input.labelIds.filter((id) => !currentIds.has(id));

  await db.$transaction([
    db.taskLabel.deleteMany({ where: { taskId: input.taskId } }),
    ...(input.labelIds.length > 0
      ? [
          db.taskLabel.createMany({
            data: input.labelIds.map((labelId) => ({
              taskId: input.taskId,
              labelId,
            })),
          }),
        ]
      : []),
  ]);
  const boardId = await revalidateTaskById(input.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "task.updated", { taskId: input.taskId });
  for (const labelId of addedLabelIds) {
    scheduleAfterResponse(() =>
      dispatchAutomationEvent({
        kind: "label.added",
        taskId: input.taskId,
        boardId: task.column.boardId,
        workspaceId: task.column.board.workspaceId,
        labelId,
        source,
      }),
    );
  }
}

export async function setTaskAssignees(
  userId: string,
  input: SetTaskAssigneesInput,
): Promise<void> {
  const task = await requireTaskAccess(userId, input.taskId);

  if (input.userIds.length > 0) {
    const workspaceId = task.column.board.workspaceId;
    const members = await db.workspaceMember.findMany({
      where: { workspaceId, userId: { in: input.userIds } },
      select: { userId: true },
    });
    if (members.length !== input.userIds.length) {
      throw new AuthzError(
        "One or more users are not members of this workspace",
        400,
      );
    }
  }

  // Diff against the current set so only NEWLY assigned users are
  // notified/auto-watched (P3.3) — re-saving the same list is a no-op.
  const current = await db.taskAssignee.findMany({
    where: { taskId: input.taskId },
    select: { userId: true },
  });
  const currentIds = new Set(current.map((a) => a.userId));
  const added = input.userIds.filter((uid) => !currentIds.has(uid));

  const notify = await db.$transaction(async (tx) => {
    await tx.taskAssignee.deleteMany({ where: { taskId: input.taskId } });
    if (input.userIds.length > 0) {
      await tx.taskAssignee.createMany({
        data: input.userIds.map((uid) => ({
          taskId: input.taskId,
          userId: uid,
        })),
      });
    }
    if (added.length === 0) return null;
    await ensureWatchers(tx, input.taskId, added);
    const ctx = await getTaskNotifyContext(tx, input.taskId, userId);
    if (!ctx) return null;
    const notified = await createTaskNotifications(
      tx,
      ctx,
      "assigned",
      added,
    );
    return { ctx, notified };
  });
  if (notify) queueNotificationEmails(notify.ctx, "assigned", notify.notified);
  const boardId = await revalidateTaskById(input.taskId);
  if (boardId)
    await emitBoardEvent(boardId, "task.updated", { taskId: input.taskId });
}

// ---------------------------------------------------------------------------
// CRM: Deal sidecar mutations (boards with kind=CRM).
// ---------------------------------------------------------------------------

async function requireCrmTask(userId: string, taskId: string) {
  await requireTaskAccess(userId, taskId);
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      column: {
        select: {
          boardId: true,
          board: { select: { kind: true, workspaceId: true } },
        },
      },
    },
  });
  if (!task) throw new AuthzError("Task not found", 404);
  if (task.column.board.kind !== BoardKind.CRM) {
    throw new AuthzError("Task is not on a CRM board", 400);
  }
  return {
    boardId: task.column.boardId,
    workspaceId: task.column.board.workspaceId,
  };
}

export async function updateDeal(
  userId: string,
  input: UpdateDealInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const { boardId } = await requireCrmTask(userId, input.taskId);

  const dealData: Record<string, unknown> = {};
  if (input.amount !== undefined) dealData.amount = input.amount;
  if (input.currency !== undefined) dealData.currency = input.currency;
  if (input.expectedCloseAt !== undefined)
    dealData.expectedCloseAt =
      input.expectedCloseAt === null ? null : new Date(input.expectedCloseAt);

  if (Object.keys(dealData).length === 0) return;

  if (input.expectedUpdatedAt) {
    const current = await db.deal.findUnique({
      where: { taskId: input.taskId },
    });
    if (current) {
      assertFresh(input.expectedUpdatedAt, current.updatedAt, {
        id: current.id,
        taskId: current.taskId,
        amount: current.amount == null ? null : Number(current.amount),
        currency: current.currency,
        expectedCloseAt: current.expectedCloseAt
          ? current.expectedCloseAt.toISOString()
          : null,
        updatedAt: current.updatedAt.toISOString(),
      });
    }
  }

  const activityPayload: Record<string, unknown> = { taskId: input.taskId };
  if (input.amount !== undefined) activityPayload.amount = input.amount;
  if (input.currency !== undefined) activityPayload.currency = input.currency;
  if (input.expectedCloseAt !== undefined)
    activityPayload.expectedCloseAt = input.expectedCloseAt;

  await db.$transaction([
    db.deal.upsert({
      where: { taskId: input.taskId },
      create: { taskId: input.taskId, ...dealData },
      update: dealData,
    }),
    db.activity.create({
      data: {
        taskId: input.taskId,
        actorId: userId,
        type: ActivityType.DEAL_UPDATED,
        payload: withSource(activityPayload, source),
      },
    }),
  ]);
  await revalidateTaskById(input.taskId);
  // P3.9: the changed fields ride along so clients patch in place.
  const dealPatch = eventPatch(activityPayload);
  await emitBoardEvent(boardId, "deal.updated", {
    taskId: input.taskId,
    patch: dealPatch,
  });
}

/**
 * Replace the full set of contacts attached to a CRM task's Deal. Diff
 * against the current set to write one CONTACT_LINKED activity per added
 * contact and one CONTACT_UNLINKED per removed contact. Same-workspace and
 * not-archived invariants apply to every added contact.
 */
export async function setDealContacts(
  userId: string,
  input: SetDealContactsInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const { boardId, workspaceId } = await requireCrmTask(userId, input.taskId);

  // Dedupe input.
  const targetIds = Array.from(new Set(input.contactIds));

  if (targetIds.length > 0) {
    const contacts = await db.contact.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, workspaceId: true, archivedAt: true },
    });
    if (contacts.length !== targetIds.length) {
      throw new AuthzError("One or more contacts not found", 404);
    }
    for (const c of contacts) {
      if (c.workspaceId !== workspaceId) {
        throw new AuthzError("Contact is in a different workspace", 400);
      }
      if (c.archivedAt) {
        throw new AuthzError("Cannot link an archived contact", 400);
      }
    }
  }

  // Ensure the Deal row exists, then diff against current contacts.
  const deal = await db.deal.upsert({
    where: { taskId: input.taskId },
    create: { taskId: input.taskId },
    update: {},
    select: { id: true, contacts: { select: { contactId: true } } },
  });

  const currentIds = new Set(deal.contacts.map((c) => c.contactId));
  const nextIds = new Set(targetIds);
  const added = [...nextIds].filter((id) => !currentIds.has(id));
  const removed = [...currentIds].filter((id) => !nextIds.has(id));

  if (added.length === 0 && removed.length === 0) return;

  await db.$transaction([
    ...(removed.length > 0
      ? [
          db.dealContact.deleteMany({
            where: { dealId: deal.id, contactId: { in: removed } },
          }),
        ]
      : []),
    ...(added.length > 0
      ? [
          db.dealContact.createMany({
            data: added.map((contactId) => ({ dealId: deal.id, contactId })),
          }),
        ]
      : []),
    ...added.map((contactId) =>
      db.activity.create({
        data: {
          taskId: input.taskId,
          actorId: userId,
          type: ActivityType.CONTACT_LINKED,
          payload: withSource({ taskId: input.taskId, contactId }, source),
        },
      }),
    ),
    ...removed.map((contactId) =>
      db.activity.create({
        data: {
          taskId: input.taskId,
          actorId: userId,
          type: ActivityType.CONTACT_UNLINKED,
          payload: withSource({ taskId: input.taskId, contactId }, source),
        },
      }),
    ),
  ]);
  await revalidateTaskById(input.taskId);
  await emitBoardEvent(boardId, "deal.updated", { taskId: input.taskId });
}

// ---------------------------------------------------------------------------
// BUGS: BugReport sidecar mutations (boards with kind=BUGS).
// ---------------------------------------------------------------------------

async function requireBugTask(userId: string, taskId: string) {
  await requireTaskAccess(userId, taskId);
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      column: {
        select: {
          boardId: true,
          board: { select: { kind: true } },
        },
      },
      bugReport: { select: { resolvedAt: true } },
    },
  });
  if (!task) throw new AuthzError("Task not found", 404);
  if (task.column.board.kind !== BoardKind.BUGS) {
    throw new AuthzError("Task is not on a BUGS board", 400);
  }
  return {
    boardId: task.column.boardId,
    previousResolvedAt: task.bugReport?.resolvedAt ?? null,
  };
}

export async function updateBugReport(
  userId: string,
  input: UpdateBugReportInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const { boardId, previousResolvedAt } = await requireBugTask(
    userId,
    input.taskId,
  );

  const data: Record<string, unknown> = {};
  if (input.severity !== undefined) data.severity = input.severity;
  if (input.reproSteps !== undefined) data.reproSteps = input.reproSteps;
  if (input.expectedBehavior !== undefined)
    data.expectedBehavior = input.expectedBehavior;
  if (input.actualBehavior !== undefined)
    data.actualBehavior = input.actualBehavior;
  if (input.affectedVersion !== undefined)
    data.affectedVersion = input.affectedVersion;
  if (input.environment !== undefined) data.environment = input.environment;
  if (input.resolvedAt !== undefined)
    data.resolvedAt =
      input.resolvedAt === null ? null : new Date(input.resolvedAt);

  if (Object.keys(data).length === 0) return;

  if (input.expectedUpdatedAt) {
    const current = await db.bugReport.findUnique({
      where: { taskId: input.taskId },
    });
    if (current) {
      assertFresh(input.expectedUpdatedAt, current.updatedAt, {
        ...current,
        resolvedAt: current.resolvedAt
          ? current.resolvedAt.toISOString()
          : null,
        createdAt: current.createdAt.toISOString(),
        updatedAt: current.updatedAt.toISOString(),
      });
    }
  }

  // Pick the right activity verb based on resolvedAt transition.
  let activityType: ActivityType = ActivityType.BUG_UPDATED;
  if (input.resolvedAt !== undefined) {
    const nextResolved =
      input.resolvedAt === null ? null : new Date(input.resolvedAt);
    if (previousResolvedAt === null && nextResolved !== null) {
      activityType = ActivityType.BUG_RESOLVED;
    } else if (previousResolvedAt !== null && nextResolved === null) {
      activityType = ActivityType.BUG_REOPENED;
    }
  }

  const activityPayload: Record<string, unknown> = { taskId: input.taskId };
  for (const k of Object.keys(data)) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) activityPayload[k] = v;
  }

  await db.$transaction([
    db.bugReport.upsert({
      where: { taskId: input.taskId },
      create: { taskId: input.taskId, ...data },
      update: data,
    }),
    db.activity.create({
      data: {
        taskId: input.taskId,
        actorId: userId,
        type: activityType,
        payload: withSource(activityPayload, source),
      },
    }),
  ]);
  await revalidateTaskById(input.taskId);
  const bugPatch = eventPatch(activityPayload);
  await emitBoardEvent(boardId, "bug.updated", {
    taskId: input.taskId,
    patch: bugPatch,
  });
}

// ---------------------------------------------------------------------------
// SUPPORT: Ticket sidecar + contact-link mutations (boards with kind=SUPPORT).
// ---------------------------------------------------------------------------

async function requireSupportTask(userId: string, taskId: string) {
  await requireTaskAccess(userId, taskId);
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      column: {
        select: {
          boardId: true,
          board: { select: { kind: true, workspaceId: true } },
        },
      },
    },
  });
  if (!task) throw new AuthzError("Task not found", 404);
  if (task.column.board.kind !== BoardKind.SUPPORT) {
    throw new AuthzError("Task is not on a SUPPORT board", 400);
  }
  return {
    boardId: task.column.boardId,
    workspaceId: task.column.board.workspaceId,
  };
}

export async function updateTicket(
  userId: string,
  input: UpdateTicketInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const { boardId } = await requireSupportTask(userId, input.taskId);

  const data: Record<string, unknown> = {};
  if (input.severity !== undefined) data.severity = input.severity;
  if (input.slaDueAt !== undefined)
    data.slaDueAt = input.slaDueAt === null ? null : new Date(input.slaDueAt);
  if (input.firstResponseAt !== undefined)
    data.firstResponseAt =
      input.firstResponseAt === null ? null : new Date(input.firstResponseAt);
  if (input.resolvedAt !== undefined)
    data.resolvedAt =
      input.resolvedAt === null ? null : new Date(input.resolvedAt);
  if (input.source !== undefined) data.source = input.source;

  if (Object.keys(data).length === 0) return;

  if (input.expectedUpdatedAt) {
    const current = await db.ticket.findUnique({
      where: { taskId: input.taskId },
    });
    if (current) {
      assertFresh(input.expectedUpdatedAt, current.updatedAt, {
        ...current,
        slaDueAt: current.slaDueAt ? current.slaDueAt.toISOString() : null,
        firstResponseAt: current.firstResponseAt
          ? current.firstResponseAt.toISOString()
          : null,
        resolvedAt: current.resolvedAt
          ? current.resolvedAt.toISOString()
          : null,
        createdAt: current.createdAt.toISOString(),
        updatedAt: current.updatedAt.toISOString(),
      });
    }
  }

  const activityPayload: Record<string, unknown> = { taskId: input.taskId };
  for (const k of Object.keys(data)) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) activityPayload[k] = v;
  }

  await db.$transaction([
    db.ticket.upsert({
      where: { taskId: input.taskId },
      create: { taskId: input.taskId, ...data },
      update: data,
    }),
    db.activity.create({
      data: {
        taskId: input.taskId,
        actorId: userId,
        type: ActivityType.TICKET_UPDATED,
        payload: withSource(activityPayload, source),
      },
    }),
  ]);
  await revalidateTaskById(input.taskId);
  const ticketPatch = eventPatch(activityPayload);
  await emitBoardEvent(boardId, "ticket.updated", {
    taskId: input.taskId,
    patch: ticketPatch,
  });
}

/**
 * Link or unlink the workspace contact on a SUPPORT task's ticket. Contacts
 * are the single party directory (Customer was merged into Contact in P1.3).
 */
export async function linkTicketContact(
  userId: string,
  input: LinkTicketContactInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const { boardId, workspaceId } = await requireSupportTask(
    userId,
    input.taskId,
  );

  if (input.contactId) {
    const contact = await db.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, workspaceId: true, archivedAt: true },
    });
    if (!contact) throw new AuthzError("Contact not found", 404);
    if (contact.workspaceId !== workspaceId) {
      throw new AuthzError("Contact is in a different workspace", 400);
    }
    if (contact.archivedAt) {
      throw new AuthzError("Cannot link an archived contact", 400);
    }
  }

  await db.$transaction([
    db.ticket.upsert({
      where: { taskId: input.taskId },
      create: { taskId: input.taskId, contactId: input.contactId },
      update: { contactId: input.contactId },
    }),
    db.activity.create({
      data: {
        taskId: input.taskId,
        actorId: userId,
        type:
          input.contactId === null
            ? ActivityType.CONTACT_UNLINKED
            : ActivityType.CONTACT_LINKED,
        payload: withSource(
          { taskId: input.taskId, contactId: input.contactId },
          source,
        ),
      },
    }),
  ]);
  await revalidateTaskById(input.taskId);
  await emitBoardEvent(boardId, "ticket.updated", { taskId: input.taskId });
}

// ---------------------------------------------------------------------------
// ROADMAP: Initiative sidecar + dependency-graph mutations (boards with
// kind=ROADMAP). Dependency edges can span boards within the same workspace
// — events fire to both endpoint boards.
// ---------------------------------------------------------------------------

async function requireRoadmapTask(userId: string, taskId: string) {
  await requireTaskAccess(userId, taskId);
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      column: {
        select: {
          boardId: true,
          board: { select: { kind: true, workspaceId: true } },
        },
      },
      initiative: { select: { id: true } },
    },
  });
  if (!task) throw new AuthzError("Task not found", 404);
  if (task.column.board.kind !== BoardKind.ROADMAP) {
    throw new AuthzError("Task is not on a ROADMAP board", 400);
  }
  return {
    boardId: task.column.boardId,
    workspaceId: task.column.board.workspaceId,
    initiativeId: task.initiative?.id ?? null,
  };
}

export async function updateInitiative(
  userId: string,
  input: UpdateInitiativeInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const { boardId } = await requireRoadmapTask(userId, input.taskId);

  const data: Record<string, unknown> = {};
  if (input.targetQuarter !== undefined)
    data.targetQuarter = input.targetQuarter;
  if (input.confidence !== undefined) data.confidence = input.confidence;
  if (input.effortEstimate !== undefined)
    data.effortEstimate = input.effortEstimate;
  if (input.rice !== undefined)
    data.rice =
      input.rice === null ? null : (input.rice as Prisma.InputJsonValue);

  if (Object.keys(data).length === 0) return;

  if (input.expectedUpdatedAt) {
    const current = await db.initiative.findUnique({
      where: { taskId: input.taskId },
    });
    if (current) {
      assertFresh(input.expectedUpdatedAt, current.updatedAt, {
        ...current,
        rice: current.rice ?? null,
        createdAt: current.createdAt.toISOString(),
        updatedAt: current.updatedAt.toISOString(),
      });
    }
  }

  const activityPayload: Record<string, unknown> = { taskId: input.taskId };
  for (const k of Object.keys(data)) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) activityPayload[k] = v;
  }

  await db.$transaction([
    db.initiative.upsert({
      where: { taskId: input.taskId },
      create: { taskId: input.taskId, ...data },
      update: data,
    }),
    db.activity.create({
      data: {
        taskId: input.taskId,
        actorId: userId,
        type: ActivityType.INITIATIVE_UPDATED,
        payload: withSource(activityPayload, source),
      },
    }),
  ]);
  await revalidateTaskById(input.taskId);
  const initiativePatch = eventPatch(activityPayload);
  await emitBoardEvent(boardId, "initiative.updated", {
    taskId: input.taskId,
    patch: initiativePatch,
  });
}

// ---------------------------------------------------------------------------
// Task links: universal graph edges between tasks of ANY board kind, same
// workspace only. Edges can span boards — activities and realtime events go
// to both endpoints. BLOCKS/DEPENDS_ON are acyclic (src/server/links/graph.ts).
// ---------------------------------------------------------------------------

const linkedTaskSelect = {
  id: true,
  number: true,
  title: true,
  workspace: { select: { taskPrefix: true } },
  column: {
    select: {
      board: { select: { id: true, name: true, slug: true, kind: true } },
    },
  },
} as const;

export async function addTaskLink(
  userId: string,
  input: AddTaskLinkInput,
  source: ActivitySource = "ui",
): Promise<void> {
  if (input.fromTaskId === input.toTaskId) {
    throw new AuthzError("A task cannot be linked to itself", 400);
  }
  const [from, to] = await Promise.all([
    requireTaskAccess(userId, input.fromTaskId),
    requireTaskAccess(userId, input.toTaskId),
  ]);
  const workspaceId = from.column.board.workspaceId;
  if (workspaceId !== to.column.board.workspaceId) {
    throw new AuthzError("Cross-workspace links are not allowed", 400);
  }

  // Idempotent no-op when the exact edge already exists.
  const existing = await db.taskLink.findUnique({
    where: {
      fromTaskId_toTaskId_kind: {
        fromTaskId: input.fromTaskId,
        toTaskId: input.toTaskId,
        kind: input.kind,
      },
    },
    select: { fromTaskId: true },
  });
  if (existing) return;

  // Load the workspace's directional edges to run cycle detection in memory.
  // Workspace task-link counts are bounded; this is cheap.
  const edges = await db.taskLink.findMany({
    where: {
      kind: { in: ["BLOCKS", "DEPENDS_ON"] },
      from: { workspaceId },
    },
    select: { fromTaskId: true, toTaskId: true, kind: true },
  });
  const cycle = findCyclePath({
    fromId: input.fromTaskId,
    toId: input.toTaskId,
    kind: input.kind as LinkKind,
    edges: edges.map((e) => ({
      fromId: e.fromTaskId,
      toId: e.toTaskId,
      kind: e.kind as LinkKind,
    })),
  });
  if (cycle) {
    // Name the cycle path with human-readable task keys so agents and users
    // can see exactly which chain closes the loop.
    const tasks = await db.task.findMany({
      where: { id: { in: cycle } },
      select: {
        id: true,
        number: true,
        workspace: { select: { taskPrefix: true } },
      },
    });
    const keyById = new Map(
      tasks.map((t) => [t.id, `${t.workspace.taskPrefix}-${t.number}`]),
    );
    const path = cycle.map((id) => keyById.get(id) ?? id).join(" → ");
    throw new AuthzError(
      `Adding this ${input.kind} link would create a cycle: ${path}`,
      400,
    );
  }

  const activityPayload = {
    fromTaskId: input.fromTaskId,
    toTaskId: input.toTaskId,
    kind: input.kind,
  };

  await db.$transaction([
    db.taskLink.create({
      data: {
        fromTaskId: input.fromTaskId,
        toTaskId: input.toTaskId,
        kind: input.kind,
        createdById: userId,
      },
    }),
    db.activity.create({
      data: {
        taskId: input.fromTaskId,
        actorId: userId,
        type: ActivityType.DEPENDENCY_ADDED,
        payload: withSource(activityPayload, source),
      },
    }),
    db.activity.create({
      data: {
        taskId: input.toTaskId,
        actorId: userId,
        type: ActivityType.DEPENDENCY_ADDED,
        payload: withSource(activityPayload, source),
      },
    }),
  ]);
  const fromBoardId = from.column.boardId;
  const toBoardId = to.column.boardId;
  await Promise.all([
    revalidateTaskById(input.fromTaskId),
    fromBoardId === toBoardId ? null : revalidateTaskById(input.toTaskId),
  ]);
  await emitBoardEvent(fromBoardId, "task.updated", {
    taskId: input.fromTaskId,
  });
  if (fromBoardId !== toBoardId) {
    await emitBoardEvent(toBoardId, "task.updated", {
      taskId: input.toTaskId,
    });
  }
}

export async function removeTaskLink(
  userId: string,
  input: RemoveTaskLinkInput,
  source: ActivitySource = "ui",
): Promise<void> {
  const [from, to] = await Promise.all([
    requireTaskAccess(userId, input.fromTaskId),
    requireTaskAccess(userId, input.toTaskId),
  ]);
  if (from.column.board.workspaceId !== to.column.board.workspaceId) {
    throw new AuthzError("Cross-workspace links are not allowed", 400);
  }

  const { count } = await db.taskLink.deleteMany({
    where: {
      fromTaskId: input.fromTaskId,
      toTaskId: input.toTaskId,
      kind: input.kind,
    },
  });
  // No-op contract: if the edge didn't exist, don't write activities or
  // fire realtime events (matches the MCP tool description).
  if (count === 0) return;

  const activityPayload = {
    fromTaskId: input.fromTaskId,
    toTaskId: input.toTaskId,
    kind: input.kind,
  };

  await db.$transaction([
    db.activity.create({
      data: {
        taskId: input.fromTaskId,
        actorId: userId,
        type: ActivityType.DEPENDENCY_REMOVED,
        payload: withSource(activityPayload, source),
      },
    }),
    db.activity.create({
      data: {
        taskId: input.toTaskId,
        actorId: userId,
        type: ActivityType.DEPENDENCY_REMOVED,
        payload: withSource(activityPayload, source),
      },
    }),
  ]);
  const fromBoardId = from.column.boardId;
  const toBoardId = to.column.boardId;
  await Promise.all([
    revalidateTaskById(input.fromTaskId),
    fromBoardId === toBoardId ? null : revalidateTaskById(input.toTaskId),
  ]);
  await emitBoardEvent(fromBoardId, "task.updated", {
    taskId: input.fromTaskId,
  });
  if (fromBoardId !== toBoardId) {
    await emitBoardEvent(toBoardId, "task.updated", {
      taskId: input.toTaskId,
    });
  }
}

export async function listTaskLinks(userId: string, input: ListTaskLinksInput) {
  await requireTaskAccess(userId, input.taskId);
  const [outgoing, incoming] = await Promise.all([
    db.taskLink.findMany({
      where: { fromTaskId: input.taskId, to: { archivedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { kind: true, createdAt: true, to: { select: linkedTaskSelect } },
    }),
    db.taskLink.findMany({
      where: { toTaskId: input.taskId, from: { archivedAt: null } },
      orderBy: { createdAt: "asc" },
      select: {
        kind: true,
        createdAt: true,
        from: { select: linkedTaskSelect },
      },
    }),
  ]);
  const summarize = (t: {
    id: string;
    number: number;
    title: string;
    workspace: { taskPrefix: string };
    column: {
      board: { id: string; name: string; slug: string; kind: string };
    };
  }) => ({
    taskId: t.id,
    key: `${t.workspace.taskPrefix}-${t.number}`,
    title: t.title,
    board: t.column.board,
  });
  return {
    outgoing: outgoing.map((l) => ({ kind: l.kind, ...summarize(l.to) })),
    incoming: incoming.map((l) => ({ kind: l.kind, ...summarize(l.from) })),
  };
}

export async function listInitiatives(
  userId: string,
  input: ListInitiativesInput,
) {
  await requireWorkspaceRole(userId, input.workspaceId);
  const take = Math.min(Math.max(input.take ?? 50, 1), 100);
  const q = input.query?.trim();
  const where = {
    task: {
      column: {
        board: {
          workspaceId: input.workspaceId,
          kind: BoardKind.ROADMAP,
        },
      },
      archivedAt: null,
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
  };
  const [totalCount, rows] = await Promise.all([
    db.initiative.count({ where }),
    db.initiative.findMany({
      where,
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    select: {
      id: true,
      taskId: true,
      targetQuarter: true,
      confidence: true,
      effortEstimate: true,
      task: {
        select: {
          title: true,
          number: true,
          workspace: { select: { taskPrefix: true } },
          column: {
            select: {
              board: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
      },
    },
    }),
  ]);
  const hasMore = rows.length > take;
  const trimmed = hasMore ? rows.slice(0, take) : rows;
  const initiatives = trimmed.map((r) => ({
    initiativeId: r.id,
    taskId: r.taskId,
    key: `${r.task.workspace.taskPrefix}-${r.task.number}`,
    title: r.task.title,
    targetQuarter: r.targetQuarter,
    confidence: r.confidence,
    effortEstimate: r.effortEstimate,
    board: r.task.column.board,
  }));
  return {
    initiatives,
    totalCount,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
    ...(hasMore
      ? {
          notice: `Showing ${initiatives.length} of ${totalCount} initiatives — pass nextCursor as the cursor argument to continue.`,
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Bulk operations (P2.3). Writes happen in a single transaction; access is
// validated per item first, and the response reports per-item results so an
// agent can retry just the failures. MCP-only surface (max 50 items, enforced
// by the schemas).
// ---------------------------------------------------------------------------

async function revalidateBoards(boardIds: string[]): Promise<void> {
  if (boardIds.length === 0) return;
  const boards = await db.board.findMany({
    where: { id: { in: boardIds } },
    select: { slug: true, workspace: { select: { slug: true } } },
  });
  for (const b of boards) {
    try {
      revalidatePath(`/${b.workspace.slug}/board/${b.slug}`);
    } catch {
      // Outside a Next request scope (scripts, tests) there is no cache to
      // revalidate — the data write already succeeded.
    }
  }
}

export async function bulkCreateTasks(
  userId: string,
  input: BulkCreateTasksInput,
  source: ActivitySource = "ui",
): Promise<{
  created: number;
  tasks: { index: number; id: string; number: number; key: string }[];
}> {
  const column = await db.column.findFirst({
    where: {
      id: input.columnId,
      archivedAt: null,
      board: { archivedAt: null },
    },
    select: {
      id: true,
      boardId: true,
      board: {
        select: {
          kind: true,
          workspaceId: true,
          workspace: { select: { taskPrefix: true } },
        },
      },
    },
  });
  if (!column) throw new AuthzError("Column not found", 404);
  await requireBoardAccess(userId, column.boardId);

  const last = await db.task.findFirst({
    where: { columnId: column.id, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const sidecar =
    column.board.kind === BoardKind.CRM
      ? { deal: { create: {} } }
      : column.board.kind === BoardKind.BUGS
        ? { bugReport: { create: {} } }
        : column.board.kind === BoardKind.SUPPORT
          ? { ticket: { create: {} } }
          : column.board.kind === BoardKind.ROADMAP
            ? { initiative: { create: {} } }
            : {};

  const created = await db.$transaction(async (tx) => {
    const first = await allocateTaskNumbers(
      tx,
      column.board.workspaceId,
      input.tasks.length,
    );
    const out: { id: string; number: number }[] = [];
    let position = last?.position ?? 0;
    for (let i = 0; i < input.tasks.length; i++) {
      const item = input.tasks[i];
      position = position === 0 && i === 0 ? 1024 : positionAfter(position);
      const row = await tx.task.create({
        data: {
          columnId: column.id,
          workspaceId: column.board.workspaceId,
          number: first + i,
          title: item.title,
          description: item.description,
          priority: item.priority ?? undefined,
          dueAt: item.dueAt ? new Date(item.dueAt) : undefined,
          position,
          createdById: userId,
          activities: {
            create: {
              actorId: userId,
              type: ActivityType.TASK_CREATED,
              payload: withSource({ bulk: true }, source),
            },
          },
          ...sidecar,
        },
        select: { id: true, number: true },
      });
      out.push(row);
    }
    return out;
    // 50 sequential creates (with nested activity + sidecar) overflow the
    // default 5s interactive-transaction budget on high-latency links —
    // surfaced by the P3.8 1k-row import smoke.
  }, { timeout: 30_000, maxWait: 10_000 });

  await revalidateBoards([column.boardId]);
  await emitBoardEvent(column.boardId, "task.created", {
    bulk: true,
    count: created.length,
  });
  return {
    created: created.length,
    tasks: created.map((t, index) => ({
      index,
      id: t.id,
      number: t.number,
      key: `${column.board.workspace.taskPrefix}-${t.number}`,
    })),
  };
}

interface BulkItemResult {
  taskId: string;
  ok: boolean;
  error?: string;
}

export async function bulkUpdateTasks(
  userId: string,
  input: BulkUpdateTasksInput,
  source: ActivitySource = "ui",
): Promise<{ updated: number; results: BulkItemResult[] }> {
  const results: BulkItemResult[] = [];
  const valid: { update: UpdateTaskInput; boardId: string }[] = [];

  for (const update of input.updates) {
    try {
      const task = await requireTaskAccess(userId, update.taskId);
      valid.push({ update, boardId: task.column.boardId });
      results.push({ taskId: update.taskId, ok: true });
    } catch (e) {
      results.push({
        taskId: update.taskId,
        ok: false,
        error: e instanceof Error ? e.message : "Access check failed",
      });
    }
  }

  const writes = valid.flatMap(({ update }) => {
    const updateData: Record<string, unknown> = {};
    if (update.title !== undefined) updateData.title = update.title;
    if (update.description !== undefined)
      updateData.description = update.description;
    if (update.priority !== undefined) updateData.priority = update.priority;
    if (update.dueAt !== undefined)
      updateData.dueAt = update.dueAt === null ? null : new Date(update.dueAt);

    const activityPayload: Record<string, unknown> = {
      taskId: update.taskId,
      bulk: true,
    };
    if (update.title !== undefined) activityPayload.title = update.title;
    if (update.description !== undefined)
      activityPayload.description = update.description;
    if (update.priority !== undefined)
      activityPayload.priority = update.priority;
    if (update.dueAt !== undefined) activityPayload.dueAt = update.dueAt;

    return [
      db.task.update({ where: { id: update.taskId }, data: updateData }),
      db.activity.create({
        data: {
          taskId: update.taskId,
          actorId: userId,
          type: ActivityType.TASK_UPDATED,
          payload: withSource(activityPayload, source),
        },
      }),
    ];
  });
  if (writes.length > 0) await db.$transaction(writes);

  const boardIds = [...new Set(valid.map((v) => v.boardId))];
  await revalidateBoards(boardIds);
  for (const boardId of boardIds) {
    await emitBoardEvent(boardId, "task.updated", { bulk: true });
  }
  return { updated: valid.length, results };
}

export async function bulkMoveTasks(
  userId: string,
  input: BulkMoveTasksInput,
  source: ActivitySource = "ui",
): Promise<{ moved: number; results: BulkItemResult[] }> {
  const results: BulkItemResult[] = [];
  const valid: {
    taskId: string;
    fromColumnId: string;
    toColumnId: string;
    boardId: string;
  }[] = [];

  for (const move of input.moves) {
    try {
      const task = await requireTaskAccess(userId, move.taskId);
      const toColumn = await db.column.findFirst({
        where: { id: move.toColumnId, archivedAt: null },
        select: { id: true, boardId: true },
      });
      if (!toColumn) throw new AuthzError("Target column not found", 404);
      if (toColumn.boardId !== task.column.boardId)
        throw new AuthzError("Cannot move task across boards");
      valid.push({
        taskId: move.taskId,
        fromColumnId: task.columnId,
        toColumnId: toColumn.id,
        boardId: toColumn.boardId,
      });
      results.push({ taskId: move.taskId, ok: true });
    } catch (e) {
      results.push({
        taskId: move.taskId,
        ok: false,
        error: e instanceof Error ? e.message : "Access check failed",
      });
    }
  }

  // Appended to the end of each destination column, stacking in input order
  // when several tasks target the same column.
  const lastByColumn = new Map<string, number>();
  for (const columnId of new Set(valid.map((v) => v.toColumnId))) {
    const lastRow = await db.task.findFirst({
      where: { columnId, archivedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    lastByColumn.set(columnId, lastRow?.position ?? 0);
  }

  const writes = valid.flatMap((v) => {
    const prev = lastByColumn.get(v.toColumnId) ?? 0;
    const position = prev === 0 ? 1024 : positionAfter(prev);
    lastByColumn.set(v.toColumnId, position);
    return [
      db.task.update({
        where: { id: v.taskId },
        data: { columnId: v.toColumnId, position },
      }),
      db.activity.create({
        data: {
          taskId: v.taskId,
          actorId: userId,
          type: ActivityType.TASK_MOVED,
          payload: withSource(
            { from: v.fromColumnId, to: v.toColumnId, bulk: true },
            source,
          ),
        },
      }),
    ];
  });
  if (writes.length > 0) await db.$transaction(writes);

  const boardIds = [...new Set(valid.map((v) => v.boardId))];
  await revalidateBoards(boardIds);
  for (const boardId of boardIds) {
    await emitBoardEvent(boardId, "task.moved", { bulk: true });
  }
  return { moved: valid.length, results };
}
