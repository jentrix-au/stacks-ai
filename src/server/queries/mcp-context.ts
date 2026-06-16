import { AttachmentStatus } from "@prisma/client";

import { db } from "@/lib/db";
import {
  AuthzError,
  requireBoardAccess,
  requireTaskAccess,
  requireWorkspaceRole,
} from "@/lib/authz";
import { restrictedWorkspaceId } from "@/lib/authz-context";
import { DOWNLOAD_URL_TTL_SECONDS, presignDownload } from "@/lib/r2";
import { searchTasksPage } from "./search";

const MAX_TASKS_PER_PAGE = 100;
const DEFAULT_TASKS_PER_PAGE = 50;

export async function listMcpWorkspaces(userId: string) {
  // Workspace-scoped tokens only ever see their own workspace.
  const restricted = restrictedWorkspaceId();
  const memberships = await db.workspaceMember.findMany({
    where: { userId, ...(restricted ? { workspaceId: restricted } : {}) },
    select: {
      role: true,
      workspace: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role,
  }));
}

export async function listMcpBoards(userId: string, workspaceId: string) {
  await requireWorkspaceRole(userId, workspaceId);
  const boards = await db.board.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      kind: true,
      archivedAt: true,
      createdAt: true,
    },
  });
  return boards.map((b) => ({
    ...b,
    archivedAt: b.archivedAt ? b.archivedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function listMcpColumns(userId: string, boardId: string) {
  await requireBoardAccess(userId, boardId);
  const columns = await db.column.findMany({
    where: { boardId, archivedAt: null },
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      position: true,
      wipLimit: true,
    },
  });
  return columns;
}

export async function listMcpLabels(userId: string, boardId: string) {
  await requireBoardAccess(userId, boardId);
  const labels = await db.label.findMany({
    where: { boardId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
  return labels;
}

export async function listMcpMembers(userId: string, workspaceId: string) {
  await requireWorkspaceRole(userId, workspaceId);
  const members = await db.workspaceMember.findMany({
    where: { workspaceId },
    orderBy: { joinedAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
  return members.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
  }));
}

export type McpResponseFormat = "concise" | "detailed";

export interface ListTasksInput {
  boardId?: string | null;
  columnId?: string | null;
  includeArchived?: boolean;
  take?: number;
  cursor?: string | null;
  /**
   * "concise" (default) = ids, keys, names, status only — target <100
   * tokens/task; "detailed" adds timestamps, labels, assignees, sidecars,
   * and link counts.
   */
  responseFormat?: McpResponseFormat;
}

export async function listMcpTasks(userId: string, input: ListTasksInput) {
  if (!input.boardId && !input.columnId) {
    throw new AuthzError("Must provide boardId or columnId to list_tasks", 400);
  }
  const take = Math.min(
    Math.max(input.take ?? DEFAULT_TASKS_PER_PAGE, 1),
    MAX_TASKS_PER_PAGE,
  );

  let boardId = input.boardId ?? undefined;
  let workspaceId: string;
  let columnFilter: {
    columnId?: string;
    column: { boardId?: string; archivedAt: null };
  };
  if (input.columnId) {
    const column = await db.column.findFirst({
      where: { id: input.columnId, archivedAt: null },
      select: { id: true, boardId: true },
    });
    if (!column) throw new AuthzError("Column not found", 404);
    const board = await requireBoardAccess(userId, column.boardId);
    workspaceId = board.workspaceId;
    boardId = column.boardId;
    columnFilter = {
      columnId: input.columnId,
      column: { archivedAt: null },
    };
  } else if (boardId) {
    const board = await requireBoardAccess(userId, boardId);
    workspaceId = board.workspaceId;
    columnFilter = { column: { boardId, archivedAt: null } };
  } else {
    // Unreachable — the guard above throws when both are missing.
    throw new AuthzError("Must provide boardId or columnId to list_tasks", 400);
  }

  const where = {
    ...columnFilter,
    ...(input.includeArchived ? {} : { archivedAt: null }),
  };

  const [workspace, board, columns, totalCount, tasks] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { taskPrefix: true },
    }),
    db.board.findUniqueOrThrow({
      where: { id: boardId },
      select: { name: true, kind: true },
    }),
    db.column.findMany({
      where: { boardId },
      select: { id: true, name: true },
    }),
    db.task.count({ where }),
    db.task.findMany({
      where,
      take: take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: [{ columnId: "asc" }, { position: "asc" }],
    select: {
      id: true,
      number: true,
      title: true,
      columnId: true,
      priority: true,
      dueAt: true,
      archivedAt: true,
      position: true,
      createdAt: true,
      updatedAt: true,
      labels: { select: { labelId: true } },
      assignees: { select: { userId: true } },
      deal: {
        select: {
          amount: true,
          currency: true,
          expectedCloseAt: true,
          contacts: { select: { contactId: true } },
        },
      },
      bugReport: {
        select: {
          severity: true,
          affectedVersion: true,
          environment: true,
          resolvedAt: true,
        },
      },
      ticket: {
        select: {
          severity: true,
          slaDueAt: true,
          firstResponseAt: true,
          resolvedAt: true,
          source: true,
          contactId: true,
        },
      },
      initiative: {
        select: {
          targetQuarter: true,
          confidence: true,
          effortEstimate: true,
        },
      },
      _count: {
        select: {
          outgoingLinks: { where: { to: { archivedAt: null } } },
          incomingLinks: { where: { from: { archivedAt: null } } },
        },
      },
    },
    }),
  ]);

  const format = input.responseFormat ?? "concise";
  const columnNameById = new Map(columns.map((c) => [c.id, c.name]));
  const hasMore = tasks.length > take;
  const trimmed = hasMore ? tasks.slice(0, take) : tasks;
  const nextCursor = hasMore ? trimmed[trimmed.length - 1].id : null;

  const rows = trimmed.map((t) => {
    const concise = {
      id: t.id,
      number: t.number,
      key: `${workspace.taskPrefix}-${t.number}`,
      title: t.title,
      columnId: t.columnId,
      columnName: columnNameById.get(t.columnId) ?? "",
      priority: t.priority,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      archivedAt: t.archivedAt ? t.archivedAt.toISOString() : null,
    };
    if (format === "concise") return concise;
    return {
      ...concise,
      position: t.position,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      labelIds: t.labels.map((l) => l.labelId),
      assigneeIds: t.assignees.map((a) => a.userId),
      deal: t.deal
        ? {
            amount: t.deal.amount == null ? null : Number(t.deal.amount),
            currency: t.deal.currency,
            expectedCloseAt: t.deal.expectedCloseAt
              ? t.deal.expectedCloseAt.toISOString()
              : null,
            contactIds: t.deal.contacts.map((c) => c.contactId),
          }
        : null,
      bugReport: t.bugReport
        ? {
            severity: t.bugReport.severity,
            affectedVersion: t.bugReport.affectedVersion,
            environment: t.bugReport.environment,
            resolvedAt: t.bugReport.resolvedAt
              ? t.bugReport.resolvedAt.toISOString()
              : null,
          }
        : null,
      ticket: t.ticket
        ? {
            severity: t.ticket.severity,
            slaDueAt: t.ticket.slaDueAt
              ? t.ticket.slaDueAt.toISOString()
              : null,
            firstResponseAt: t.ticket.firstResponseAt
              ? t.ticket.firstResponseAt.toISOString()
              : null,
            resolvedAt: t.ticket.resolvedAt
              ? t.ticket.resolvedAt.toISOString()
              : null,
            source: t.ticket.source,
            contactId: t.ticket.contactId,
          }
        : null,
      initiative: t.initiative
        ? {
            targetQuarter: t.initiative.targetQuarter,
            confidence: t.initiative.confidence,
            effortEstimate: t.initiative.effortEstimate,
          }
        : null,
      links: {
        outgoingCount: t._count.outgoingLinks,
        incomingCount: t._count.incomingLinks,
      },
    };
  });

  return {
    boardId,
    boardName: board.name,
    boardKind: board.kind,
    totalCount,
    tasks: rows,
    nextCursor,
    ...(hasMore
      ? {
          notice: `Showing ${rows.length} of ${totalCount} tasks — pass nextCursor as the cursor argument to continue.`,
        }
      : {}),
  };
}

export interface McpTaskRef {
  taskId?: string | null;
  workspaceId?: string | null;
  number?: number | null;
}

/**
 * Resolve an MCP task reference — either a raw task ID, or the human-readable
 * key pair { workspaceId, number } ("STK-42" → number 42). Throws
 * INVALID_INPUT when neither form is provided and NOT_FOUND when the number
 * doesn't exist. Authz still happens in requireTaskAccess afterwards.
 */
export async function resolveMcpTaskId(ref: McpTaskRef): Promise<string> {
  if (ref.taskId) return ref.taskId;
  if (ref.workspaceId && ref.number != null) {
    const task = await db.task.findUnique({
      where: {
        workspaceId_number: {
          workspaceId: ref.workspaceId,
          number: ref.number,
        },
      },
      select: { id: true },
    });
    if (!task) throw new AuthzError("Task not found", 404);
    return task.id;
  }
  throw new AuthzError(
    "Provide taskId, or workspaceId + number (the numeric part of the task key)",
    400,
  );
}

export async function getMcpTask(
  userId: string,
  ref: McpTaskRef,
  responseFormat: McpResponseFormat = "detailed",
) {
  const taskId = await resolveMcpTaskId(ref);
  await requireTaskAccess(userId, taskId);
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      number: true,
      workspaceId: true,
      workspace: { select: { taskPrefix: true } },
      title: true,
      description: true,
      columnId: true,
      priority: true,
      dueAt: true,
      archivedAt: true,
      position: true,
      createdAt: true,
      updatedAt: true,
      column: {
        select: {
          id: true,
          name: true,
          boardId: true,
          board: { select: { name: true, kind: true } },
        },
      },
      labels: {
        select: {
          label: { select: { id: true, name: true, color: true } },
        },
      },
      assignees: {
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      subtasks: {
        orderBy: { position: "asc" },
        select: { id: true, title: true, completed: true, position: true },
      },
      deal: {
        select: {
          id: true,
          amount: true,
          currency: true,
          expectedCloseAt: true,
          contacts: {
            select: {
              contact: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  company: true,
                },
              },
            },
          },
        },
      },
      bugReport: {
        select: {
          id: true,
          severity: true,
          reproSteps: true,
          expectedBehavior: true,
          actualBehavior: true,
          affectedVersion: true,
          environment: true,
          resolvedAt: true,
        },
      },
      ticket: {
        select: {
          id: true,
          severity: true,
          slaDueAt: true,
          firstResponseAt: true,
          resolvedAt: true,
          source: true,
          contact: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              company: true,
              externalId: true,
            },
          },
        },
      },
      initiative: {
        select: {
          id: true,
          targetQuarter: true,
          confidence: true,
          effortEstimate: true,
          rice: true,
        },
      },
      outgoingLinks: {
        where: { to: { archivedAt: null } },
        select: {
          kind: true,
          to: {
            select: {
              id: true,
              number: true,
              title: true,
              workspace: { select: { taskPrefix: true } },
              column: {
                select: {
                  board: {
                    select: { id: true, name: true, slug: true, kind: true },
                  },
                },
              },
            },
          },
        },
      },
      incomingLinks: {
        where: { from: { archivedAt: null } },
        select: {
          kind: true,
          from: {
            select: {
              id: true,
              number: true,
              title: true,
              workspace: { select: { taskPrefix: true } },
              column: {
                select: {
                  board: {
                    select: { id: true, name: true, slug: true, kind: true },
                  },
                },
              },
            },
          },
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          payload: true,
          createdAt: true,
          actorId: true,
        },
      },
    },
  });
  if (!task) throw new AuthzError("Task not found", 404);

  const core = {
    id: task.id,
    number: task.number,
    key: `${task.workspace.taskPrefix}-${task.number}`,
    workspaceId: task.workspaceId,
    title: task.title,
    columnId: task.columnId,
    columnName: task.column.name,
    boardId: task.column.boardId,
    boardName: task.column.board.name,
    boardKind: task.column.board.kind,
    priority: task.priority,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    archivedAt: task.archivedAt ? task.archivedAt.toISOString() : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };

  if (responseFormat === "concise") {
    return {
      ...core,
      counts: {
        labels: task.labels.length,
        assignees: task.assignees.length,
        subtasks: task.subtasks.length,
        subtasksCompleted: task.subtasks.filter((s) => s.completed).length,
        outgoingLinks: task.outgoingLinks.length,
        incomingLinks: task.incomingLinks.length,
      },
    };
  }

  return {
    ...core,
    description: task.description,
    position: task.position,
    labels: task.labels.map((l) => l.label),
    assignees: task.assignees.map((a) => a.user),
    subtasks: task.subtasks,
    deal: task.deal
      ? {
          id: task.deal.id,
          amount: task.deal.amount == null ? null : Number(task.deal.amount),
          currency: task.deal.currency,
          expectedCloseAt: task.deal.expectedCloseAt
            ? task.deal.expectedCloseAt.toISOString()
            : null,
          contacts: task.deal.contacts.map((c) => c.contact),
        }
      : null,
    bugReport: task.bugReport
      ? {
          id: task.bugReport.id,
          severity: task.bugReport.severity,
          reproSteps: task.bugReport.reproSteps,
          expectedBehavior: task.bugReport.expectedBehavior,
          actualBehavior: task.bugReport.actualBehavior,
          affectedVersion: task.bugReport.affectedVersion,
          environment: task.bugReport.environment,
          resolvedAt: task.bugReport.resolvedAt
            ? task.bugReport.resolvedAt.toISOString()
            : null,
        }
      : null,
    ticket: task.ticket
      ? {
          id: task.ticket.id,
          severity: task.ticket.severity,
          slaDueAt: task.ticket.slaDueAt
            ? task.ticket.slaDueAt.toISOString()
            : null,
          firstResponseAt: task.ticket.firstResponseAt
            ? task.ticket.firstResponseAt.toISOString()
            : null,
          resolvedAt: task.ticket.resolvedAt
            ? task.ticket.resolvedAt.toISOString()
            : null,
          source: task.ticket.source,
          contact: task.ticket.contact,
        }
      : null,
    initiative: task.initiative
      ? {
          id: task.initiative.id,
          targetQuarter: task.initiative.targetQuarter,
          confidence: task.initiative.confidence,
          effortEstimate: task.initiative.effortEstimate,
          rice: task.initiative.rice,
        }
      : null,
    links: {
      outgoing: task.outgoingLinks.map((l) => ({
        kind: l.kind,
        taskId: l.to.id,
        key: `${l.to.workspace.taskPrefix}-${l.to.number}`,
        title: l.to.title,
        board: l.to.column.board,
      })),
      incoming: task.incomingLinks.map((l) => ({
        kind: l.kind,
        taskId: l.from.id,
        key: `${l.from.workspace.taskPrefix}-${l.from.number}`,
        title: l.from.title,
        board: l.from.column.board,
      })),
    },
    recentActivity: task.activities.map((a) => ({
      id: a.id,
      type: a.type,
      payload: a.payload,
      createdAt: a.createdAt.toISOString(),
      actorId: a.actorId,
    })),
  };
}

// ---------------------------------------------------------------------------
// P2.3 orientation + coverage reads
// ---------------------------------------------------------------------------

const SNAPSHOT_TASK_CAP = 500;

/**
 * The orientation tool: board + columns + concise task rows in ONE call,
 * so an agent doesn't burn list_boards → list_columns → list_tasks×N.
 */
export async function getMcpBoardSnapshot(userId: string, boardId: string) {
  const board = await requireBoardAccess(userId, boardId);
  const taskWhere = {
    archivedAt: null,
    column: { boardId, archivedAt: null },
  };
  const [meta, workspace, columns, totalTasks, tasks] = await Promise.all([
    db.board.findUniqueOrThrow({
      where: { id: boardId },
      select: { name: true, slug: true, kind: true },
    }),
    db.workspace.findUniqueOrThrow({
      where: { id: board.workspaceId },
      select: { taskPrefix: true },
    }),
    db.column.findMany({
      where: { boardId, archivedAt: null },
      orderBy: { position: "asc" },
      select: { id: true, name: true, position: true, wipLimit: true },
    }),
    db.task.count({ where: taskWhere }),
    db.task.findMany({
      where: taskWhere,
      take: SNAPSHOT_TASK_CAP + 1,
      orderBy: [{ columnId: "asc" }, { position: "asc" }],
      select: {
        id: true,
        number: true,
        title: true,
        columnId: true,
        priority: true,
        dueAt: true,
      },
    }),
  ]);

  const capped = tasks.length > SNAPSHOT_TASK_CAP;
  const usable = capped ? tasks.slice(0, SNAPSHOT_TASK_CAP) : tasks;
  const byColumn = new Map<string, typeof usable>();
  for (const t of usable) {
    const list = byColumn.get(t.columnId);
    if (list) list.push(t);
    else byColumn.set(t.columnId, [t]);
  }

  return {
    board: { id: boardId, name: meta.name, slug: meta.slug, kind: meta.kind },
    workspaceId: board.workspaceId,
    taskPrefix: workspace.taskPrefix,
    totalTasks,
    columns: columns.map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
      wipLimit: c.wipLimit,
      tasks: (byColumn.get(c.id) ?? []).map((t) => ({
        id: t.id,
        number: t.number,
        key: `${workspace.taskPrefix}-${t.number}`,
        title: t.title,
        priority: t.priority,
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      })),
    })),
    ...(capped
      ? {
          notice: `Snapshot capped at ${SNAPSHOT_TASK_CAP} of ${totalTasks} tasks — use list_tasks(boardId) with cursor pagination for the rest.`,
        }
      : {}),
  };
}

export interface SearchTasksInput {
  workspaceId: string;
  query: string;
  take?: number;
  cursor?: string | null;
}

/**
 * Workspace-wide task search over the P3.1 FTS layer (tsvector websearch +
 * trigram-ILIKE fallback + comment bodies, see src/server/queries/search.ts).
 * Tool contract (shape, ordering, cursor semantics) is unchanged from the
 * pre-FTS ILIKE implementation.
 */
export async function searchMcpTasks(userId: string, input: SearchTasksInput) {
  await requireWorkspaceRole(userId, input.workspaceId);
  const q = input.query.trim();
  if (!q) throw new AuthzError("query must not be empty", 400);
  const take = Math.min(Math.max(input.take ?? 25, 1), 100);
  const [workspace, page] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: input.workspaceId },
      select: { taskPrefix: true },
    }),
    searchTasksPage({
      workspaceId: input.workspaceId,
      query: q,
      take: take + 1,
      cursor: input.cursor,
    }),
  ]);
  const { totalCount } = page;
  const hasMore = page.rows.length > take;
  const trimmed = hasMore ? page.rows.slice(0, take) : page.rows;
  const results = trimmed.map((t) => ({
    id: t.id,
    number: t.number,
    key: `${workspace.taskPrefix}-${t.number}`,
    title: t.title,
    priority: t.priority,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    updatedAt: t.updatedAt.toISOString(),
    columnId: t.columnId,
    columnName: t.columnName,
    boardId: t.boardId,
    boardName: t.boardName,
    boardKind: t.boardKind,
  }));
  return {
    results,
    totalCount,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
    ...(hasMore
      ? {
          notice: `Showing ${results.length} of ${totalCount} matches — pass nextCursor as the cursor argument to continue.`,
        }
      : {}),
  };
}

export interface ListActivityInput {
  taskId?: string | null;
  boardId?: string | null;
  since?: string | null;
  source?: "ui" | "mcp" | null;
  type?: string | null;
  includeArchivedTasks?: boolean;
  take?: number;
  cursor?: string | null;
}

/**
 * Activity feed for a task or a whole board — lets an agent diff what
 * happened (and who did it: payload.source distinguishes humans from
 * agents). Archived tasks' history is excluded unless includeArchivedTasks.
 */
export async function listMcpActivity(userId: string, input: ListActivityInput) {
  if (!input.taskId && !input.boardId) {
    throw new AuthzError("Provide taskId or boardId to list_activity", 400);
  }
  const take = Math.min(Math.max(input.take ?? 50, 1), 100);

  let scope: Record<string, unknown>;
  if (input.taskId) {
    await requireTaskAccess(userId, input.taskId);
    scope = { taskId: input.taskId };
  } else {
    await requireBoardAccess(userId, input.boardId!);
    scope = {
      task: {
        column: { boardId: input.boardId! },
        ...(input.includeArchivedTasks ? {} : { archivedAt: null }),
      },
    };
  }
  const where = {
    ...scope,
    ...(input.since ? { createdAt: { gte: new Date(input.since) } } : {}),
    ...(input.type ? { type: input.type as never } : {}),
    ...(input.source
      ? { payload: { path: ["source"], equals: input.source } }
      : {}),
  };
  const [totalCount, rows] = await Promise.all([
    db.activity.count({ where }),
    db.activity.findMany({
      where,
      take: take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        taskId: true,
        type: true,
        payload: true,
        createdAt: true,
        actorId: true,
        actor: { select: { name: true } },
        task: {
          select: {
            number: true,
            workspace: { select: { taskPrefix: true } },
          },
        },
      },
    }),
  ]);
  const hasMore = rows.length > take;
  const trimmed = hasMore ? rows.slice(0, take) : rows;
  const activities = trimmed.map((a) => ({
    id: a.id,
    taskId: a.taskId,
    taskKey: `${a.task.workspace.taskPrefix}-${a.task.number}`,
    type: a.type,
    payload: a.payload,
    createdAt: a.createdAt.toISOString(),
    actorId: a.actorId,
    actorName: a.actor?.name ?? null,
  }));
  return {
    activities,
    totalCount,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
    ...(hasMore
      ? {
          notice: `Showing ${activities.length} of ${totalCount} activities — pass nextCursor as the cursor argument to continue.`,
        }
      : {}),
  };
}

/**
 * READY attachments on a task with short-lived signed download URLs
 * (uploads remain UI-only for now).
 */
export async function listMcpAttachments(userId: string, taskId: string) {
  await requireTaskAccess(userId, taskId);
  const rows = await db.attachment.findMany({
    where: { taskId, status: AttachmentStatus.READY },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      mimeType: true,
      size: true,
      width: true,
      height: true,
      r2Key: true,
      createdAt: true,
      uploader: { select: { id: true, name: true } },
    },
  });
  const attachments = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      mimeType: r.mimeType,
      size: r.size,
      width: r.width,
      height: r.height,
      createdAt: r.createdAt.toISOString(),
      uploader: r.uploader,
      downloadUrl: await presignDownload(r.r2Key),
    })),
  );
  return {
    attachments,
    ...(attachments.length > 0
      ? {
          notice: `downloadUrl values expire after ${DOWNLOAD_URL_TTL_SECONDS} seconds — re-call this tool for fresh links.`,
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// P2.5 resource reads
// ---------------------------------------------------------------------------

/** Cheap workspace orientation: boards + members + counts in one read. */
export async function getMcpWorkspaceOverview(
  userId: string,
  workspaceId: string,
) {
  const member = await requireWorkspaceRole(userId, workspaceId);
  const [workspace, boards, members, openTasks] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true, taskPrefix: true },
    }),
    db.board.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, kind: true },
    }),
    db.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { joinedAt: "asc" },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    db.task.count({
      where: {
        workspaceId,
        archivedAt: null,
        column: { archivedAt: null, board: { archivedAt: null } },
      },
    }),
  ]);

  const columns = await db.column.findMany({
    where: { boardId: { in: boards.map((b) => b.id) }, archivedAt: null },
    select: {
      boardId: true,
      _count: { select: { tasks: { where: { archivedAt: null } } } },
    },
  });
  const tasksByBoard = new Map<string, number>();
  for (const c of columns) {
    tasksByBoard.set(
      c.boardId,
      (tasksByBoard.get(c.boardId) ?? 0) + c._count.tasks,
    );
  }

  return {
    workspace,
    role: member.role,
    counts: {
      boards: boards.length,
      members: members.length,
      openTasks,
    },
    boards: boards.map((b) => ({
      ...b,
      openTasks: tasksByBoard.get(b.id) ?? 0,
    })),
    members: members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
  };
}

/**
 * Resolve a human-readable task key ("STK-42") to the full task. Prefixes
 * are not globally unique — resolution scans the caller's workspaces and
 * rejects ambiguous keys with a pointer to get_task(workspaceId, number).
 */
export async function getMcpTaskByKey(userId: string, key: string) {
  const match = /^([A-Za-z0-9]+)-(\d+)$/.exec(key.trim());
  if (!match) {
    throw new AuthzError(
      `Invalid task key "${key}" — expected PREFIX-NUMBER, e.g. STK-42`,
      400,
    );
  }
  const prefix = match[1].toUpperCase();
  const number = Number(match[2]);

  const restricted = restrictedWorkspaceId();
  const memberships = await db.workspaceMember.findMany({
    where: {
      userId,
      workspace: { taskPrefix: prefix },
      ...(restricted ? { workspaceId: restricted } : {}),
    },
    select: { workspaceId: true },
  });
  const tasks = await db.task.findMany({
    where: {
      number,
      workspaceId: { in: memberships.map((m) => m.workspaceId) },
    },
    select: { id: true },
  });
  if (tasks.length === 0) throw new AuthzError("Task not found", 404);
  if (tasks.length > 1) {
    throw new AuthzError(
      `Task key ${key} is ambiguous — ${tasks.length} of your workspaces share the prefix ${prefix}. Use get_task with workspaceId + number instead.`,
      400,
    );
  }
  return getMcpTask(userId, { taskId: tasks[0].id }, "detailed");
}
