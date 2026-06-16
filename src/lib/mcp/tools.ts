import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { runWithMcpRequestContext } from "@/lib/authz-context";
import { usageDay } from "@/lib/api-tokens";
import { db } from "@/lib/db";
import {
  errorPayload,
  toErrorPayload,
  type HintOverrides,
  type McpErrorPayload,
} from "@/lib/mcp/errors";
import { ActivityType } from "@/lib/enums";
import {
  BoardSnapshotOutput,
  BulkCreateTasksOutput,
  BulkMoveTasksOutput,
  BulkUpdateTasksOutput,
  ConvertBoardKindOutput,
  CreateBoardOutput,
  CreateCommentOutput,
  CreateContactOutput,
  CreateSubtaskOutput,
  CreateTaskOutput,
  GetTaskOutput,
  ListActivityOutput,
  ListAttachmentsOutput,
  ListBoardsOutput,
  ListColumnsOutput,
  ListCommentsOutput,
  ListContactsOutput,
  ListInitiativesOutput,
  ListLabelsOutput,
  ListMembersOutput,
  ListTaskLinksOutput,
  ListTasksOutput,
  ListWorkspacesOutput,
  ManageColumnsOutput,
  ManageLabelsOutput,
  CreateWebhookOutput,
  ListWebhookDeliveriesOutput,
  ListWebhooksOutput,
  OkOutput,
  RenameBoardOutput,
  SearchTasksOutput,
  FindSimilarTasksOutput,
  AutomationRuleOutput,
  ListAutomationsOutput,
} from "@/lib/mcp/output-schemas";
import { withIdempotencyKey } from "@/lib/mcp/idempotency";
import { scopeViolation, type ToolClass } from "@/lib/mcp/scopes";
import { REQUESTS_PER_MINUTE } from "@/lib/rate-limit";
import * as ops from "@/server/tasks/operations";
import * as boardOps from "@/server/boards/operations";
import * as columnOps from "@/server/columns/operations";
import * as commentOps from "@/server/comments/operations";
import * as contactOps from "@/server/contacts/operations";
import * as labelOps from "@/server/labels/operations";
import * as subtaskOps from "@/server/subtasks/operations";
import * as webhookOps from "@/server/webhooks/operations";
import * as automationOps from "@/server/automations/operations";
import {
  CreateAutomationSchema,
  ListAutomationsSchema,
  SetAutomationEnabledSchema,
} from "@/server/automations/schemas";
import {
  CreateWebhookSchema,
  DeleteWebhookSchema,
  ListWebhookDeliveriesSchema,
  ListWebhooksSchema,
} from "@/server/webhooks/schemas";
import {
  ConvertBoardKindSchema,
  CreateBoardSchema,
  RenameBoardSchema,
} from "@/server/boards/schemas";
import { ManageColumnsSchema } from "@/server/columns/schemas";
import {
  CreateCommentSchema,
  DeleteCommentSchema,
  ListCommentsSchema,
  UpdateCommentSchema,
} from "@/server/comments/schemas";
import { ManageLabelsSchema } from "@/server/labels/schemas";
import {
  CreateSubtaskSchema,
  DeleteSubtaskSchema,
  ToggleSubtaskSchema,
} from "@/server/subtasks/schemas";
import {
  AddTaskLinkSchema,
  ArchiveTaskSchema,
  BulkCreateTasksSchema,
  BulkMoveTasksSchema,
  BulkUpdateTasksSchema,
  CreateTaskSchema,
  LinkTicketContactSchema,
  ListInitiativesSchema,
  ListTaskLinksSchema,
  MoveTaskSchema,
  RemoveTaskLinkSchema,
  SetDealContactsSchema,
  SetTaskAssigneesSchema,
  SetTaskLabelsSchema,
  UpdateBugReportSchema,
  UpdateDealSchema,
  UpdateInitiativeSchema,
  UpdateTaskSchema,
  UpdateTicketSchema,
} from "@/server/tasks/schemas";
import {
  ArchiveContactSchema,
  CreateContactSchema,
  ListContactsSchema,
  UpdateContactSchema,
} from "@/server/contacts/schemas";
import {
  getMcpBoardSnapshot,
  getMcpTask,
  listMcpActivity,
  listMcpAttachments,
  listMcpBoards,
  listMcpColumns,
  listMcpLabels,
  listMcpMembers,
  listMcpTasks,
  listMcpWorkspaces,
  searchMcpTasks,
} from "@/server/queries/mcp-context";
import { AuthzError } from "@/lib/authz";
import {
  findSimilarToQuery,
  findSimilarToTask,
} from "@/server/queries/similar";

export interface ToolExtra {
  authInfo?: { scopes?: string[]; extra?: Record<string, unknown> };
}

export function requireUserId(extra: ToolExtra): string {
  const userId = extra.authInfo?.extra?.userId;
  if (typeof userId !== "string") {
    throw new Error("Missing user context — auth was not validated");
  }
  return userId;
}

export function allowedWorkspaceId(extra: ToolExtra): string | null {
  const v = extra.authInfo?.extra?.allowedWorkspaceId;
  return typeof v === "string" ? v : null;
}

function tokenIdOf(extra: ToolExtra): string | null {
  const v = extra.authInfo?.extra?.tokenId;
  return typeof v === "string" ? v : null;
}

function authExtraString(extra: ToolExtra, key: string): string | null {
  const v = extra.authInfo?.extra?.[key];
  return typeof v === "string" ? v : null;
}

/**
 * Optional retry-safety key on create_* and bulk_* tools (P2.4): replaying the
 * same key + same arguments within 24h returns the stored result; the same
 * key with different arguments is a CONFLICT.
 */
const IdempotencyKeyParam = z
  .string()
  .min(1)
  .max(200)
  .optional()
  .describe(
    "Optional idempotency key: retrying with the same key and arguments within 24h returns the original result instead of creating duplicates. Reusing a key with different arguments fails with CONFLICT.",
  );

function ok(value: unknown): CallToolResult {
  return {
    // Compact JSON in the text fallback — agents pay per token. Structured
    // clients read structuredContent (validated against outputSchema).
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function err(payload: McpErrorPayload): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

export function rateLimitInfo(
  extra: ToolExtra,
): { retryAfterSeconds: number } | undefined {
  const rl = extra.authInfo?.extra?.rateLimit;
  if (
    rl &&
    typeof rl === "object" &&
    typeof (rl as { retryAfterSeconds?: unknown }).retryAfterSeconds ===
      "number"
  ) {
    return rl as { retryAfterSeconds: number };
  }
  return undefined;
}

/**
 * Per-tool-call guard + structured error envelope. Every tool goes through
 * here so agents always get `{ error: { code, message, hint } }` JSON with
 * `isError: true`, never a bare string.
 *
 * `toolClass` declares the scope the token must carry ("read" for queries,
 * "write" for mutations, "admin" for the structural surface); workspace-
 * scoped tokens additionally have every authz check pinned to their
 * workspace via runWithWorkspaceRestriction. `hints` lets a tool replace
 * the generic hint for specific error codes. Exported for unit tests.
 */
export async function safe(
  extra: ToolExtra,
  toolClass: ToolClass,
  fn: () => Promise<unknown>,
  hints?: HintOverrides,
): Promise<CallToolResult> {
  const rateLimit = rateLimitInfo(extra);
  if (rateLimit) {
    return err(
      errorPayload(
        "RATE_LIMITED",
        `Rate limit exceeded (${REQUESTS_PER_MINUTE} requests/min)`,
        `Wait ${rateLimit.retryAfterSeconds} seconds, then retry.`,
        rateLimit.retryAfterSeconds,
      ),
    );
  }
  const violation = scopeViolation(extra.authInfo?.scopes, toolClass);
  if (violation) return err(violation);
  const tokenId = tokenIdOf(extra);
  try {
    const value = await runWithMcpRequestContext(
      {
        allowedWorkspaceId: allowedWorkspaceId(extra),
        tokenId,
        tokenName: authExtraString(extra, "tokenName"),
        tokenDisplayName: authExtraString(extra, "tokenDisplayName"),
        tokenEmoji: authExtraString(extra, "tokenEmoji"),
      },
      fn,
    );
    if (toolClass !== "read" && tokenId) countMutation(tokenId);
    return ok(value);
  } catch (e) {
    return err(toErrorPayload(e, hints));
  }
}

/** Daily mutation rollup (P2.8) — fire-and-forget, never blocks the call. */
function countMutation(tokenId: string): void {
  try {
    const day = usageDay();
    void db.apiTokenUsage
      .upsert({
        where: { tokenId_day: { tokenId, day } },
        create: { tokenId, day, requests: 0, mutations: 1 },
        update: { mutations: { increment: 1 } },
      })
      .catch(() => {
        // non-critical write
      });
  } catch {
    // non-critical write — never fail the tool call over usage accounting
  }
}

// ---------------------------------------------------------------------------
// Annotations (spec 2025-03-26+). Defaults are conservative — explicit on
// every tool: our tools are closed-world (own DB only), reads are read-only,
// archives/conversion are flagged destructive, and set-style/update-style
// tools are idempotent (same args → same end state).
// ---------------------------------------------------------------------------

const READ = {
  readOnlyHint: true,
  openWorldHint: false,
} as const;

const WRITE_IDEMPOTENT = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const WRITE_CREATES = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

// ---------------------------------------------------------------------------
// Per-tool error-hint overrides (P2.2) — point the agent at the actual
// recovery path instead of the generic envelope hint.
// ---------------------------------------------------------------------------

const SIDECAR_HINTS: Record<string, HintOverrides> = {
  CRM: {
    INVALID_INPUT:
      "This tool only works on tasks whose board kind = CRM. Check the kind via list_boards(workspaceId).",
  },
  BUGS: {
    INVALID_INPUT:
      "This tool only works on tasks whose board kind = BUGS. Check the kind via list_boards(workspaceId).",
  },
  SUPPORT: {
    INVALID_INPUT:
      "This tool only works on tasks whose board kind = SUPPORT. Check the kind via list_boards(workspaceId).",
  },
  ROADMAP: {
    INVALID_INPUT:
      "This tool only works on tasks whose board kind = ROADMAP. Check the kind via list_boards(workspaceId).",
  },
};

const GET_TASK_HINTS: HintOverrides = {
  NOT_FOUND:
    "Task not found. Discover tasks via list_tasks(boardId), or resolve a key like STK-42 by passing { workspaceId, number: 42 }.",
};

const LIST_TASKS_HINTS: HintOverrides = {
  INVALID_INPUT:
    "Pass boardId (from list_boards) or columnId (from list_columns).",
};

const TASK_LINK_HINTS: HintOverrides = {
  INVALID_INPUT:
    "BLOCKS/DEPENDS_ON edges that would create a cycle are rejected — inspect existing edges with list_task_links, or use RELATES_TO for a non-blocking association. Both tasks must be in the same workspace.",
};

const LIST_ACTIVITY_HINTS: HintOverrides = {
  INVALID_INPUT:
    "Pass taskId (from list_tasks) or boardId (from list_boards), optionally with since/source/type filters.",
};

const COMMENT_AUTHOR_HINTS: HintOverrides = {
  FORBIDDEN:
    "Only the comment's author can edit or delete it. Create a new comment instead, or have the author's token make this call.",
};

// ---------------------------------------------------------------------------
// Input shapes (MCP-only params live here; shared mutation schemas come from
// the ops layer so both surfaces stay in lockstep)
// ---------------------------------------------------------------------------

const ListBoardsShape = {
  workspaceId: z
    .string()
    .min(1)
    .describe("Workspace ID. Discover via list_workspaces."),
};

const ListColumnsShape = {
  boardId: z
    .string()
    .min(1)
    .describe("Board ID. Discover via list_boards(workspaceId)."),
};

const ListLabelsShape = {
  boardId: z.string().min(1).describe("Board ID."),
};

const ListMembersShape = {
  workspaceId: z.string().min(1).describe("Workspace ID."),
};

const ListTasksShape = {
  boardId: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by board. Provide either boardId or columnId."),
  columnId: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by column. Provide either boardId or columnId."),
  includeArchived: z
    .boolean()
    .optional()
    .describe("Include archived tasks (default false)."),
  take: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size (default 50, max 100)."),
  cursor: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Pagination cursor from a previous response's nextCursor."),
  response_format: z
    .enum(["concise", "detailed"])
    .optional()
    .describe(
      "concise (default): ids, keys, titles, column/status, priority, due date. detailed: adds timestamps, labels, assignees, kind-specific sidecars, link counts.",
    ),
};

const GetTaskShape = {
  taskId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "ID of the task to fetch. Provide either taskId, or workspaceId + number.",
    ),
  workspaceId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Workspace ID — combined with `number` to resolve a task by its human-readable key (STK-42 → number 42).",
    ),
  number: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Task number within the workspace (numeric part of the key)."),
  response_format: z
    .enum(["concise", "detailed"])
    .optional()
    .describe(
      "detailed (default): full task with description, labels, assignees, subtasks, sidecar, links, recent activity. concise: scalars + counts only.",
    ),
};

const ListContactsShape = {
  ...ListContactsSchema.shape,
  response_format: z
    .enum(["concise", "detailed"])
    .optional()
    .describe(
      "concise (default): id, name, email, company. detailed: adds phone, externalId, archive state, timestamps.",
    ),
};

const BoardSnapshotShape = {
  boardId: z
    .string()
    .min(1)
    .describe("Board to snapshot. Discover via list_boards(workspaceId)."),
};

const SearchTasksShape = {
  workspaceId: z
    .string()
    .min(1)
    .describe("Workspace to search. Discover via list_workspaces."),
  query: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Search text — matched against task titles, descriptions, and comment bodies (websearch syntax supported).",
    ),
  take: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size (default 25, max 100)."),
  cursor: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Pagination cursor from a previous response's nextCursor."),
};

const FindSimilarTasksShape = {
  taskId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Find tasks similar to this task (uses its stored embedding). Provide taskId OR workspaceId + query.",
    ),
  workspaceId: z
    .string()
    .min(1)
    .optional()
    .describe("Workspace to search when using a free-text query."),
  query: z
    .string()
    .min(1)
    .max(2000)
    .optional()
    .describe("Free text to match semantically (used with workspaceId)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Max results (default 10, max 25)."),
};

const ListActivityShape = {
  taskId: z
    .string()
    .min(1)
    .optional()
    .describe("Scope to one task. Provide taskId or boardId."),
  boardId: z
    .string()
    .min(1)
    .optional()
    .describe("Scope to a whole board. Provide taskId or boardId."),
  since: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Only activity at/after this ISO timestamp."),
  source: z
    .enum(["ui", "mcp"])
    .optional()
    .describe("Filter by actor type: 'ui' = humans, 'mcp' = agents."),
  type: z
    .enum(ActivityType)
    .optional()
    .describe("Filter by activity type (e.g. TASK_MOVED, COMMENT_CREATED)."),
  includeArchivedTasks: z
    .boolean()
    .optional()
    .describe(
      "Board scope only: include history of archived tasks (default false).",
    ),
  take: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size (default 50, max 100)."),
  cursor: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Pagination cursor from a previous response's nextCursor."),
};

const ListAttachmentsShape = {
  taskId: z.string().min(1).describe("Task whose attachments to list."),
};

const ManageLabelsShape = ManageLabelsSchema.shape;
const ManageColumnsShape = ManageColumnsSchema.shape;

export function registerTools(server: McpServer) {
  server.registerTool(
    "list_workspaces",
    {
      description:
        "List workspaces the authenticated user belongs to, with their role.",
      inputSchema: {},
      outputSchema: ListWorkspacesOutput.shape,
      annotations: READ,
    },
    async (_args, extra) =>
      safe(extra, "read", async () => ({
        workspaces: await listMcpWorkspaces(requireUserId(extra)),
      })),
  );

  server.registerTool(
    "list_boards",
    {
      description: "List boards in a workspace.",
      inputSchema: ListBoardsShape,
      outputSchema: ListBoardsOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () => ({
        boards: await listMcpBoards(requireUserId(extra), args.workspaceId),
      })),
  );

  server.registerTool(
    "list_columns",
    {
      description:
        "List columns of a board, ordered by position. Columns represent statuses on the kanban board.",
      inputSchema: ListColumnsShape,
      outputSchema: ListColumnsOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () => ({
        columns: await listMcpColumns(requireUserId(extra), args.boardId),
      })),
  );

  server.registerTool(
    "list_labels",
    {
      description: "List labels available on a board.",
      inputSchema: ListLabelsShape,
      outputSchema: ListLabelsOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () => ({
        labels: await listMcpLabels(requireUserId(extra), args.boardId),
      })),
  );

  server.registerTool(
    "list_members",
    {
      description:
        "List members of a workspace. Use the userId field when assigning tasks.",
      inputSchema: ListMembersShape,
      outputSchema: ListMembersOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () => ({
        members: await listMcpMembers(requireUserId(extra), args.workspaceId),
      })),
  );

  server.registerTool(
    "list_tasks",
    {
      description:
        "List tasks in a board or column with board/column names, total count, and pagination. Concise by default — pass response_format: 'detailed' for sidecars/labels/assignees. At least one of boardId or columnId is required.",
      inputSchema: ListTasksShape,
      outputSchema: ListTasksOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(
        extra,
        "read",
        async () =>
          listMcpTasks(requireUserId(extra), {
            ...args,
            responseFormat: args.response_format,
          }),
        LIST_TASKS_HINTS,
      ),
  );

  server.registerTool(
    "get_task",
    {
      description:
        "Fetch full details of a task including description, labels, assignees, subtasks, links, and recent activity. Accepts taskId, or workspaceId + number (the numeric part of a task key like STK-42). Pass response_format: 'concise' for scalars + counts only.",
      inputSchema: GetTaskShape,
      outputSchema: GetTaskOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(
        extra,
        "read",
        async () =>
          getMcpTask(
            requireUserId(extra),
            args,
            args.response_format ?? "detailed",
          ),
        GET_TASK_HINTS,
      ),
  );

  server.registerTool(
    "create_task",
    {
      description:
        "Create a new task in a column. Returns the new task's ID, per-workspace number, and human-readable key (e.g. STK-42).",
      inputSchema: {
        ...CreateTaskSchema.shape,
        idempotencyKey: IdempotencyKeyParam,
      },
      outputSchema: CreateTaskOutput.shape,
      annotations: WRITE_CREATES,
    },
    async (args, extra) =>
      safe(extra, "write", async () =>
        withIdempotencyKey(tokenIdOf(extra), "create_task", args, () =>
          ops.createTask(requireUserId(extra), args, "mcp"),
        ),
      ),
  );

  server.registerTool(
    "update_task",
    {
      description:
        "Update fields on an existing task. Only provided fields are changed.",
      inputSchema: UpdateTaskSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        await ops.updateTask(requireUserId(extra), args, "mcp");
        return { ok: true };
      }),
  );

  server.registerTool(
    "move_task",
    {
      description:
        "Move a task to a different column (= change status on the kanban board) and/or reorder it. Use beforeTaskId/afterTaskId for placement; omit both to append to the end.",
      inputSchema: MoveTaskSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_CREATES,
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        await ops.moveTask(requireUserId(extra), args, "mcp");
        return { ok: true };
      }),
  );

  server.registerTool(
    "archive_task",
    {
      description:
        "Archive a task (soft delete — it disappears from the board but is recoverable).",
      inputSchema: ArchiveTaskSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: DESTRUCTIVE,
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        await ops.archiveTask(requireUserId(extra), args, "mcp");
        return { ok: true };
      }),
  );

  server.registerTool(
    "set_task_labels",
    {
      description:
        "Set the full list of labels on a task. REPLACES existing labels; pass current+new to add, pass current-removed to delete. All label IDs must belong to the task's board.",
      inputSchema: SetTaskLabelsSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        await ops.setTaskLabels(requireUserId(extra), args);
        return { ok: true };
      }),
  );

  server.registerTool(
    "set_task_assignees",
    {
      description:
        "Set the full list of assignees on a task. REPLACES existing assignees. All user IDs must be members of the task's workspace.",
      inputSchema: SetTaskAssigneesSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        await ops.setTaskAssignees(requireUserId(extra), args);
        return { ok: true };
      }),
  );

  // -------------------------------------------------------------------------
  // CRM tools (deal sidecar) + the workspace contact directory. Contacts are
  // the ONE party table — deals attach many contacts, SUPPORT tickets link
  // one contact.
  // -------------------------------------------------------------------------

  server.registerTool(
    "update_deal",
    {
      description:
        "Update the Deal sidecar on a task whose board kind = CRM. Only provided fields are changed; pass null to clear. Creates the Deal row if it doesn't exist yet.",
      inputSchema: UpdateDealSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(
        extra,
        "write",
        async () => {
          await ops.updateDeal(requireUserId(extra), args, "mcp");
          return { ok: true };
        },
        SIDECAR_HINTS.CRM,
      ),
  );

  server.registerTool(
    "set_deal_contacts",
    {
      description:
        "Set the full list of contacts attached to a CRM task's deal. REPLACES existing contacts — pass current+new to add, pass current-removed to remove, pass [] to clear. All contacts must belong to the same workspace as the task and not be archived. Writes one CONTACT_LINKED activity per added contact, one CONTACT_UNLINKED per removed.",
      inputSchema: SetDealContactsSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(
        extra,
        "write",
        async () => {
          await ops.setDealContacts(requireUserId(extra), args, "mcp");
          return { ok: true };
        },
        SIDECAR_HINTS.CRM,
      ),
  );

  server.registerTool(
    "create_contact",
    {
      description:
        "Create a workspace-scoped contact (name required; email/phone/company/externalId optional). Contacts are shared by CRM deals and SUPPORT tickets. Returns the new contact ID.",
      inputSchema: {
        ...CreateContactSchema.shape,
        idempotencyKey: IdempotencyKeyParam,
      },
      outputSchema: CreateContactOutput.shape,
      annotations: WRITE_CREATES,
    },
    async (args, extra) =>
      safe(extra, "write", async () =>
        withIdempotencyKey(tokenIdOf(extra), "create_contact", args, () =>
          contactOps.createContact(requireUserId(extra), args),
        ),
      ),
  );

  server.registerTool(
    "update_contact",
    {
      description:
        "Update fields on an existing contact. Only provided fields are changed; pass null to clear optional fields.",
      inputSchema: UpdateContactSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        await contactOps.updateContact(requireUserId(extra), args);
        return { ok: true };
      }),
  );

  server.registerTool(
    "archive_contact",
    {
      description:
        "Archive a contact (soft delete — disappears from pickers but existing deal links are preserved).",
      inputSchema: ArchiveContactSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: DESTRUCTIVE,
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        await contactOps.archiveContact(requireUserId(extra), args);
        return { ok: true };
      }),
  );

  server.registerTool(
    "list_contacts",
    {
      description:
        "List/search workspace contacts, optionally filtered by query (substring match on name/email/company), with total count. Concise by default — pass response_format: 'detailed' for phone/externalId/timestamps. Paginated; pass nextCursor from the previous response to continue.",
      inputSchema: ListContactsShape,
      outputSchema: ListContactsOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () =>
        contactOps.listContacts(
          requireUserId(extra),
          args,
          args.response_format ?? "concise",
        ),
      ),
  );

  // -------------------------------------------------------------------------
  // BUGS tools (bug-report sidecar)
  // -------------------------------------------------------------------------

  server.registerTool(
    "update_bug_report",
    {
      description:
        "Update the BugReport sidecar on a task whose board kind = BUGS. Only provided fields are changed; pass null to clear. Setting resolvedAt records BUG_RESOLVED; clearing it records BUG_REOPENED.",
      inputSchema: UpdateBugReportSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(
        extra,
        "write",
        async () => {
          await ops.updateBugReport(requireUserId(extra), args, "mcp");
          return { ok: true };
        },
        SIDECAR_HINTS.BUGS,
      ),
  );

  // -------------------------------------------------------------------------
  // SUPPORT tools (ticket sidecar; tickets link to the contact directory)
  // -------------------------------------------------------------------------

  server.registerTool(
    "update_ticket",
    {
      description:
        "Update the Ticket sidecar on a task whose board kind = SUPPORT. Only provided fields are changed; pass null to clear.",
      inputSchema: UpdateTicketSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(
        extra,
        "write",
        async () => {
          await ops.updateTicket(requireUserId(extra), args, "mcp");
          return { ok: true };
        },
        SIDECAR_HINTS.SUPPORT,
      ),
  );

  server.registerTool(
    "link_contact",
    {
      description:
        "Link or unlink a workspace contact to a SUPPORT task's ticket. Pass contactId=null to unlink. The contact must belong to the same workspace as the task. (Contacts are the single party directory — use list_contacts / create_contact to find or add people.)",
      inputSchema: LinkTicketContactSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(
        extra,
        "write",
        async () => {
          await ops.linkTicketContact(requireUserId(extra), args, "mcp");
          return { ok: true };
        },
        SIDECAR_HINTS.SUPPORT,
      ),
  );

  // -------------------------------------------------------------------------
  // ROADMAP tools (initiative sidecar + dependency graph)
  // -------------------------------------------------------------------------

  server.registerTool(
    "update_initiative",
    {
      description:
        "Update the Initiative sidecar on a task whose board kind = ROADMAP. Only provided fields are changed; pass null to clear.",
      inputSchema: UpdateInitiativeSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(
        extra,
        "write",
        async () => {
          await ops.updateInitiative(requireUserId(extra), args, "mcp");
          return { ok: true };
        },
        SIDECAR_HINTS.ROADMAP,
      ),
  );

  server.registerTool(
    "list_initiatives",
    {
      description:
        "List workspace initiatives (across all ROADMAP boards), with their parent board and total count. Paginated.",
      inputSchema: ListInitiativesSchema.shape,
      outputSchema: ListInitiativesOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () =>
        ops.listInitiatives(requireUserId(extra), args),
      ),
  );

  server.registerTool(
    "convert_board_kind",
    {
      description:
        "Convert a board to a different kind (TASKS/CRM/SUPPORT/BUGS/ROADMAP). Requires ADMIN role. Eagerly creates the target kind's sidecar on every non-archived task; columns and other-kind sidecars are preserved. Returns how many sidecars were backfilled.",
      inputSchema: ConvertBoardKindSchema.shape,
      outputSchema: ConvertBoardKindOutput.shape,
      annotations: { ...DESTRUCTIVE, idempotentHint: true },
    },
    async (args, extra) =>
      safe(extra, "admin", async () =>
        boardOps.convertBoardKind(requireUserId(extra), args),
      ),
  );

  // -------------------------------------------------------------------------
  // Task links (universal graph — any board kind, same workspace)
  // -------------------------------------------------------------------------

  server.registerTool(
    "add_task_link",
    {
      description:
        "Link two tasks of ANY board kind in the same workspace (cross-board allowed), e.g. a bug that BLOCKS a deal. Kinds: BLOCKS, DEPENDS_ON, RELATES_TO, DUPLICATES. Rejects BLOCKS/DEPENDS_ON edges that would create a cycle — the error names the cycle path by task key. Adding an edge that already exists is a no-op.",
      inputSchema: AddTaskLinkSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(
        extra,
        "write",
        async () => {
          await ops.addTaskLink(requireUserId(extra), args, "mcp");
          return { ok: true };
        },
        TASK_LINK_HINTS,
      ),
  );

  server.registerTool(
    "remove_task_link",
    {
      description:
        "Remove a task link (exact fromTaskId + toTaskId + kind match). No-op if the edge does not exist.",
      inputSchema: RemoveTaskLinkSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        await ops.removeTaskLink(requireUserId(extra), args, "mcp");
        return { ok: true };
      }),
  );

  server.registerTool(
    "list_task_links",
    {
      description:
        "List a task's outgoing and incoming links with the linked tasks' keys, titles, and boards.",
      inputSchema: ListTaskLinksSchema.shape,
      outputSchema: ListTaskLinksOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () =>
        ops.listTaskLinks(requireUserId(extra), args),
      ),
  );

  // -------------------------------------------------------------------------
  // Orientation + discovery (P2.3)
  // -------------------------------------------------------------------------

  server.registerTool(
    "get_board_snapshot",
    {
      description:
        "THE orientation tool: board info + columns + concise task rows in one call. Use this first instead of list_boards → list_columns → list_tasks. Capped at 500 tasks (notice explains how to page the rest).",
      inputSchema: BoardSnapshotShape,
      outputSchema: BoardSnapshotOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () =>
        getMcpBoardSnapshot(requireUserId(extra), args.boardId),
      ),
  );

  server.registerTool(
    "search_tasks",
    {
      description:
        "Search tasks workspace-wide across all boards: full-text (websearch syntax — words, quoted phrases, -negation) over title/description/comments, plus case-insensitive substring on title/description. Returns concise rows with board/column names. Archived tasks excluded.",
      inputSchema: SearchTasksShape,
      outputSchema: SearchTasksOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () =>
        searchMcpTasks(requireUserId(extra), args),
      ),
  );

  server.registerTool(
    "find_similar_tasks",
    {
      description:
        "Find tasks SEMANTICALLY similar to an existing task (pass taskId) or to free text (pass workspaceId + query) via vector embeddings — catches duplicates and related work that keyword search misses. similarity is cosine in [0,1]; ≥0.8 is a strong duplicate candidate (link with add_task_link kind DUPLICATES). Embeddings refresh every ~5 minutes, so very recent edits may not match yet; falls back to an empty result with a notice when semantic search is not configured.",
      inputSchema: FindSimilarTasksShape,
      outputSchema: FindSimilarTasksOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () => {
        const userId = requireUserId(extra);
        if (args.taskId) {
          return findSimilarToTask(userId, {
            taskId: args.taskId,
            limit: args.limit,
          });
        }
        if (args.workspaceId && args.query) {
          return findSimilarToQuery(userId, {
            workspaceId: args.workspaceId,
            query: args.query,
            limit: args.limit,
          });
        }
        throw new AuthzError(
          "Provide either taskId, or workspaceId + query",
          400,
        );
      }),
  );

  server.registerTool(
    "list_activity",
    {
      description:
        "List the activity log for a task or a whole board, newest first. Filter by since (ISO timestamp), source ('ui' = humans, 'mcp' = agents), or activity type — e.g. diff what humans did since your last run.",
      inputSchema: ListActivityShape,
      outputSchema: ListActivityOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(
        extra,
        "read",
        async () => listMcpActivity(requireUserId(extra), args),
        LIST_ACTIVITY_HINTS,
      ),
  );

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_comments",
    {
      description: "List a task's comments oldest-first, with authors.",
      inputSchema: ListCommentsSchema.shape,
      outputSchema: ListCommentsOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () =>
        commentOps.listComments(requireUserId(extra), args),
      ),
  );

  server.registerTool(
    "create_comment",
    {
      description: "Add a comment to a task (markdown body, max 20k chars).",
      inputSchema: {
        ...CreateCommentSchema.shape,
        idempotencyKey: IdempotencyKeyParam,
      },
      outputSchema: CreateCommentOutput.shape,
      annotations: WRITE_CREATES,
    },
    async (args, extra) =>
      safe(extra, "write", async () =>
        withIdempotencyKey(tokenIdOf(extra), "create_comment", args, () =>
          commentOps.createComment(requireUserId(extra), args, "mcp"),
        ),
      ),
  );

  server.registerTool(
    "update_comment",
    {
      description:
        "Edit a comment's body. Only the comment's author can edit it.",
      inputSchema: UpdateCommentSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(
        extra,
        "write",
        async () => {
          await commentOps.updateComment(requireUserId(extra), args, "mcp");
          return { ok: true };
        },
        COMMENT_AUTHOR_HINTS,
      ),
  );

  server.registerTool(
    "delete_comment",
    {
      description:
        "Delete a comment permanently. Only the comment's author can delete it.",
      inputSchema: DeleteCommentSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: DESTRUCTIVE,
    },
    async (args, extra) =>
      safe(
        extra,
        "write",
        async () => {
          await commentOps.deleteComment(requireUserId(extra), args, "mcp");
          return { ok: true };
        },
        COMMENT_AUTHOR_HINTS,
      ),
  );

  // -------------------------------------------------------------------------
  // Subtasks
  // -------------------------------------------------------------------------

  server.registerTool(
    "create_subtask",
    {
      description: "Add a subtask (checklist item) to a task.",
      inputSchema: {
        ...CreateSubtaskSchema.shape,
        idempotencyKey: IdempotencyKeyParam,
      },
      outputSchema: CreateSubtaskOutput.shape,
      annotations: WRITE_CREATES,
    },
    async (args, extra) =>
      safe(extra, "write", async () =>
        withIdempotencyKey(tokenIdOf(extra), "create_subtask", args, () =>
          subtaskOps.createSubtask(requireUserId(extra), args, "mcp"),
        ),
      ),
  );

  server.registerTool(
    "toggle_subtask",
    {
      description: "Mark a subtask complete or incomplete.",
      inputSchema: ToggleSubtaskSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        await subtaskOps.toggleSubtask(requireUserId(extra), args, "mcp");
        return { ok: true };
      }),
  );

  server.registerTool(
    "delete_subtask",
    {
      description: "Delete a subtask permanently.",
      inputSchema: DeleteSubtaskSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: DESTRUCTIVE,
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        await subtaskOps.deleteSubtask(requireUserId(extra), args);
        return { ok: true };
      }),
  );

  // -------------------------------------------------------------------------
  // Attachments (read-only — uploads stay in the UI)
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_attachments",
    {
      description:
        "List a task's attachments with short-lived signed download URLs (~5 min). Uploads are UI-only.",
      inputSchema: ListAttachmentsShape,
      outputSchema: ListAttachmentsOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "read", async () =>
        listMcpAttachments(requireUserId(extra), args.taskId),
      ),
  );

  // -------------------------------------------------------------------------
  // Board / column / label management (consolidated action-param tools for
  // label+column CRUD — GitHub's tool-count lesson)
  // -------------------------------------------------------------------------

  server.registerTool(
    "manage_labels",
    {
      description:
        "Create, update, or delete a board label (action: 'create' | 'update' | 'delete'). create needs boardId+name+color; update needs labelId and name and/or color; delete needs labelId. Creating an existing name returns the existing label. Use set_task_labels to apply labels to tasks.",
      inputSchema: ManageLabelsShape,
      outputSchema: ManageLabelsOutput.shape,
      annotations: { ...DESTRUCTIVE, destructiveHint: true },
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        const input = ManageLabelsSchema.parse(args);
        const userId = requireUserId(extra);
        if (input.action === "create") {
          const label = await labelOps.createLabel(userId, {
            boardId: input.boardId!,
            name: input.name!,
            color: input.color!,
          });
          return { ok: true, label };
        }
        if (input.action === "update") {
          const label = await labelOps.updateLabel(userId, {
            labelId: input.labelId!,
            name: input.name,
            color: input.color,
          });
          return { ok: true, label };
        }
        await labelOps.deleteLabel(userId, { labelId: input.labelId! });
        return { ok: true };
      }),
  );

  server.registerTool(
    "manage_columns",
    {
      description:
        "Create, rename, move, or archive a board column (action: 'create' | 'rename' | 'move' | 'archive'). create needs boardId+name; rename needs columnId+name; move needs columnId + beforeColumnId/afterColumnId; archive needs columnId (tasks in it disappear from the board with it).",
      inputSchema: ManageColumnsShape,
      outputSchema: ManageColumnsOutput.shape,
      annotations: { ...DESTRUCTIVE, destructiveHint: true },
    },
    async (args, extra) =>
      safe(extra, "write", async () => {
        const input = ManageColumnsSchema.parse(args);
        const userId = requireUserId(extra);
        switch (input.action) {
          case "create": {
            const column = await columnOps.createColumn(userId, {
              boardId: input.boardId!,
              name: input.name!,
            });
            return { ok: true, column };
          }
          case "rename":
            await columnOps.renameColumn(userId, {
              columnId: input.columnId!,
              name: input.name!,
            });
            return { ok: true };
          case "move":
            await columnOps.moveColumn(userId, {
              columnId: input.columnId!,
              beforeColumnId: input.beforeColumnId,
              afterColumnId: input.afterColumnId,
            });
            return { ok: true };
          case "archive":
            await columnOps.archiveColumn(userId, {
              columnId: input.columnId!,
            });
            return { ok: true };
        }
      }),
  );

  server.registerTool(
    "create_board",
    {
      description:
        "Create a board in a workspace with the default columns for its kind (TASKS/CRM/SUPPORT/BUGS/ROADMAP, default TASKS).",
      inputSchema: {
        ...CreateBoardSchema.shape,
        idempotencyKey: IdempotencyKeyParam,
      },
      outputSchema: CreateBoardOutput.shape,
      annotations: WRITE_CREATES,
    },
    async (args, extra) =>
      safe(extra, "write", async () =>
        withIdempotencyKey(tokenIdOf(extra), "create_board", args, async () => {
          const board = await boardOps.createBoard(requireUserId(extra), args);
          return {
            id: board.id,
            name: board.name,
            slug: board.slug,
            kind: board.kind,
          };
        }),
      ),
  );

  server.registerTool(
    "rename_board",
    {
      description: "Rename a board.",
      inputSchema: RenameBoardSchema.shape,
      outputSchema: RenameBoardOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(extra, "write", async () =>
        boardOps.renameBoard(requireUserId(extra), args),
      ),
  );

  // -------------------------------------------------------------------------
  // Bulk operations (single transaction, max 50, per-item results)
  // -------------------------------------------------------------------------

  server.registerTool(
    "bulk_create_tasks",
    {
      description:
        "Create up to 50 tasks in one column in a single transaction (all-or-nothing). Returns each new task's id, number, and key in input order.",
      inputSchema: {
        ...BulkCreateTasksSchema.shape,
        idempotencyKey: IdempotencyKeyParam,
      },
      outputSchema: BulkCreateTasksOutput.shape,
      annotations: WRITE_CREATES,
    },
    async (args, extra) =>
      safe(extra, "write", async () =>
        withIdempotencyKey(tokenIdOf(extra), "bulk_create_tasks", args, () =>
          ops.bulkCreateTasks(requireUserId(extra), args, "mcp"),
        ),
      ),
  );

  server.registerTool(
    "bulk_update_tasks",
    {
      description:
        "Update up to 50 tasks at once. Access is checked per task; valid updates apply in one transaction and the per-item result array reports any failures so you can retry just those.",
      inputSchema: {
        ...BulkUpdateTasksSchema.shape,
        idempotencyKey: IdempotencyKeyParam,
      },
      outputSchema: BulkUpdateTasksOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(extra, "write", async () =>
        withIdempotencyKey(tokenIdOf(extra), "bulk_update_tasks", args, () =>
          ops.bulkUpdateTasks(requireUserId(extra), args, "mcp"),
        ),
      ),
  );

  server.registerTool(
    "bulk_move_tasks",
    {
      description:
        "Move up to 50 tasks to new columns at once (each appended to the end of its destination, in input order). Access is checked per task; valid moves apply in one transaction with per-item results.",
      inputSchema: {
        ...BulkMoveTasksSchema.shape,
        idempotencyKey: IdempotencyKeyParam,
      },
      outputSchema: BulkMoveTasksOutput.shape,
      annotations: WRITE_CREATES,
    },
    async (args, extra) =>
      safe(extra, "write", async () =>
        withIdempotencyKey(tokenIdOf(extra), "bulk_move_tasks", args, () =>
          ops.bulkMoveTasks(requireUserId(extra), args, "mcp"),
        ),
      ),
  );

  // -------------------------------------------------------------------------
  // Webhooks (admin scope — webhooks send workspace data to external URLs)
  // -------------------------------------------------------------------------

  server.registerTool(
    "create_webhook",
    {
      description:
        "Create an outbound webhook for a workspace (requires the admin token scope + ADMIN role). Events are HMAC-SHA256-signed POSTs with X-Stacks-Signature/-Timestamp/-Event/-Delivery-Id headers; failed deliveries retry with backoff for up to 8 attempts. The signing secret is returned ONCE. URL must be public https.",
      inputSchema: CreateWebhookSchema.shape,
      outputSchema: CreateWebhookOutput.shape,
      annotations: WRITE_CREATES,
    },
    async (args, extra) =>
      safe(extra, "admin", async () =>
        webhookOps.createWebhook(requireUserId(extra), args),
      ),
  );

  server.registerTool(
    "list_webhooks",
    {
      description:
        "List a workspace's outbound webhooks (admin scope). Secrets are never returned; consecutiveFailures > 0 means recent deliveries are exhausting their retries (3 in a row auto-disables the webhook).",
      inputSchema: ListWebhooksSchema.shape,
      outputSchema: ListWebhooksOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "admin", async () =>
        webhookOps.listWebhooks(requireUserId(extra), args),
      ),
  );

  server.registerTool(
    "delete_webhook",
    {
      description:
        "Delete an outbound webhook and its delivery history (admin scope).",
      inputSchema: DeleteWebhookSchema.shape,
      outputSchema: OkOutput.shape,
      annotations: DESTRUCTIVE,
    },
    async (args, extra) =>
      safe(extra, "admin", async () => {
        await webhookOps.deleteWebhook(requireUserId(extra), args);
        return { ok: true };
      }),
  );

  server.registerTool(
    "list_webhook_deliveries",
    {
      description:
        "List a webhook's recent deliveries with status/attempts/errors (admin scope), newest first. Paginated.",
      inputSchema: ListWebhookDeliveriesSchema.shape,
      outputSchema: ListWebhookDeliveriesOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "admin", async () =>
        webhookOps.listWebhookDeliveries(requireUserId(extra), args),
      ),
  );

  // -------------------------------------------------------------------------
  // Automations (P3.7, admin scope — rules act with their creator's identity)
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_automations",
    {
      description:
        "List a workspace's automation rules (admin scope), optionally filtered to one board plus workspace-wide rules. Shows trigger/conditions/actions, run counts, and enabled state.",
      inputSchema: ListAutomationsSchema.shape,
      outputSchema: ListAutomationsOutput.shape,
      annotations: READ,
    },
    async (args, extra) =>
      safe(extra, "admin", async () =>
        automationOps.listAutomations(requireUserId(extra), args),
      ),
  );

  server.registerTool(
    "create_automation",
    {
      description:
        "Create an automation rule (admin scope + ADMIN role). Triggers: task.created, task.moved_to_column (optional columnId), label.added (optional labelId), due.passed, sla.breached. Actions run as the rule's creator with source 'automation' and can NEVER trigger other rules (hard loop guard).",
      inputSchema: CreateAutomationSchema.shape,
      outputSchema: AutomationRuleOutput.shape,
      annotations: WRITE_CREATES,
    },
    async (args, extra) =>
      safe(extra, "admin", async () =>
        automationOps.createAutomation(requireUserId(extra), args),
      ),
  );

  server.registerTool(
    "set_automation_enabled",
    {
      description:
        "Enable or disable an automation rule (admin scope + ADMIN role).",
      inputSchema: SetAutomationEnabledSchema.shape,
      outputSchema: AutomationRuleOutput.shape,
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) =>
      safe(extra, "admin", async () =>
        automationOps.setAutomationEnabled(requireUserId(extra), args),
      ),
  );
}
