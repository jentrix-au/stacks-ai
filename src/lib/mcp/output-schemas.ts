import { z } from "zod";

import {
  BoardKind,
  BugSeverity,
  InitiativeConfidence,
  Priority,
  Role,
  TaskLinkKind,
  TicketSeverity,
} from "@/lib/enums";

// Output schemas for every MCP tool (P2.2). Registered as `outputSchema` so
// clients get JSON Schema for results and the SDK validates the
// `structuredContent` we return next to the text fallback.
//
// Convention: every tool result is an OBJECT (the spec requires object
// structuredContent), so list tools wrap their arrays ({ boards: [...] }).
// Dates are ISO strings — query layers convert before returning.
// Concise/detailed `response_format` tools mark detailed-only fields
// .optional().

const isoDate = z.string().describe("ISO 8601 timestamp");
const nullableIsoDate = isoDate.nullable();

const boardRef = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  kind: z.enum(BoardKind),
});

// ---------------------------------------------------------------------------
// Context / read tools
// ---------------------------------------------------------------------------

export const ListWorkspacesOutput = z.object({
  workspaces: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      role: z.enum(Role).describe("The authenticated user's role"),
    }),
  ),
});

export const ListBoardsOutput = z.object({
  boards: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      kind: z.enum(BoardKind),
      archivedAt: nullableIsoDate,
      createdAt: isoDate,
    }),
  ),
});

export const ListColumnsOutput = z.object({
  columns: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      position: z.number(),
      wipLimit: z.number().int().nullable(),
    }),
  ),
});

export const ListLabelsOutput = z.object({
  labels: z.array(
    z.object({ id: z.string(), name: z.string(), color: z.string() }),
  ),
});

export const ListMembersOutput = z.object({
  members: z.array(
    z.object({
      userId: z.string(),
      name: z.string().nullable(),
      email: z.string(),
      role: z.enum(Role),
    }),
  ),
});

const dealRow = z.object({
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  expectedCloseAt: nullableIsoDate,
  contactIds: z.array(z.string()),
});

const bugReportRow = z.object({
  severity: z.enum(BugSeverity).nullable(),
  affectedVersion: z.string().nullable(),
  environment: z.string().nullable(),
  resolvedAt: nullableIsoDate,
});

const ticketRow = z.object({
  severity: z.enum(TicketSeverity).nullable(),
  slaDueAt: nullableIsoDate,
  firstResponseAt: nullableIsoDate,
  resolvedAt: nullableIsoDate,
  source: z.string().nullable(),
  contactId: z.string().nullable(),
});

const initiativeRow = z.object({
  targetQuarter: z.string().nullable(),
  confidence: z.enum(InitiativeConfidence).nullable(),
  effortEstimate: z.string().nullable(),
});

const taskRow = z.object({
  id: z.string(),
  number: z.number().int(),
  key: z.string().describe("Human-readable task key, e.g. STK-42"),
  title: z.string(),
  columnId: z.string(),
  columnName: z.string().describe("Column = status on the kanban board"),
  priority: z.enum(Priority),
  dueAt: nullableIsoDate,
  archivedAt: nullableIsoDate,
  // Detailed-only fields (response_format: "detailed"):
  position: z.number().optional(),
  createdAt: isoDate.optional(),
  updatedAt: isoDate.optional(),
  labelIds: z.array(z.string()).optional(),
  assigneeIds: z.array(z.string()).optional(),
  deal: dealRow.nullable().optional(),
  bugReport: bugReportRow.nullable().optional(),
  ticket: ticketRow.nullable().optional(),
  initiative: initiativeRow.nullable().optional(),
  links: z
    .object({
      outgoingCount: z.number().int(),
      incomingCount: z.number().int(),
    })
    .optional(),
});

export const ListTasksOutput = z.object({
  boardId: z.string(),
  boardName: z.string(),
  boardKind: z.enum(BoardKind),
  totalCount: z
    .number()
    .int()
    .describe("Total tasks matching the filter, across all pages"),
  tasks: z.array(taskRow),
  nextCursor: z.string().nullable(),
  notice: z
    .string()
    .optional()
    .describe("Present when the page is truncated — explains how to continue"),
});

const contactSummary = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
});

const linkedTask = z.object({
  kind: z.enum(TaskLinkKind),
  taskId: z.string(),
  key: z.string(),
  title: z.string(),
  board: boardRef,
});

export const GetTaskOutput = z.object({
  id: z.string(),
  number: z.number().int(),
  key: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  columnId: z.string(),
  columnName: z.string(),
  boardId: z.string(),
  boardName: z.string(),
  boardKind: z.enum(BoardKind),
  priority: z.enum(Priority),
  dueAt: nullableIsoDate,
  archivedAt: nullableIsoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
  // Concise-only summary (response_format: "concise"):
  counts: z
    .object({
      labels: z.number().int(),
      assignees: z.number().int(),
      subtasks: z.number().int(),
      subtasksCompleted: z.number().int(),
      outgoingLinks: z.number().int(),
      incomingLinks: z.number().int(),
    })
    .optional(),
  // Detailed-only fields (response_format: "detailed", the default):
  description: z.string().nullable().optional(),
  position: z.number().optional(),
  labels: z
    .array(z.object({ id: z.string(), name: z.string(), color: z.string() }))
    .optional(),
  assignees: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().nullable(),
        email: z.string(),
      }),
    )
    .optional(),
  subtasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        completed: z.boolean(),
        position: z.number(),
      }),
    )
    .optional(),
  deal: dealRow
    .omit({ contactIds: true })
    .extend({ id: z.string(), contacts: z.array(contactSummary) })
    .nullable()
    .optional(),
  bugReport: bugReportRow
    .extend({
      id: z.string(),
      reproSteps: z.string().nullable(),
      expectedBehavior: z.string().nullable(),
      actualBehavior: z.string().nullable(),
    })
    .nullable()
    .optional(),
  ticket: ticketRow
    .omit({ contactId: true })
    .extend({
      id: z.string(),
      contact: contactSummary
        .extend({ externalId: z.string().nullable() })
        .nullable(),
    })
    .nullable()
    .optional(),
  initiative: initiativeRow
    .extend({ id: z.string(), rice: z.unknown().nullable() })
    .nullable()
    .optional(),
  links: z
    .object({
      outgoing: z.array(linkedTask),
      incoming: z.array(linkedTask),
    })
    .optional(),
  recentActivity: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        payload: z.unknown().nullable(),
        createdAt: isoDate,
        actorId: z.string().nullable(),
      }),
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Mutations that don't return an entity acknowledge with `{ ok: true }`. */
export const OkOutput = z.object({ ok: z.literal(true) });

export const CreateTaskOutput = z.object({
  id: z.string(),
  number: z.number().int(),
  key: z.string().describe("Human-readable task key, e.g. STK-42"),
});

export const CreateContactOutput = z.object({ id: z.string() });

export const ConvertBoardKindOutput = z.object({
  kind: z.enum(BoardKind),
  backfilled: z
    .number()
    .int()
    .describe("How many tasks received the target kind's sidecar"),
});

// ---------------------------------------------------------------------------
// Contacts / initiatives / links
// ---------------------------------------------------------------------------

const contactRow = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  company: z.string().nullable(),
  // Detailed-only fields (response_format: "detailed"):
  phone: z.string().nullable().optional(),
  externalId: z.string().nullable().optional(),
  archivedAt: nullableIsoDate.optional(),
  createdAt: isoDate.optional(),
  updatedAt: isoDate.optional(),
});

export const ListContactsOutput = z.object({
  contacts: z.array(contactRow),
  totalCount: z.number().int(),
  nextCursor: z.string().nullable(),
  notice: z.string().optional(),
});

export const ListInitiativesOutput = z.object({
  initiatives: z.array(
    z.object({
      initiativeId: z.string(),
      taskId: z.string(),
      key: z.string(),
      title: z.string(),
      targetQuarter: z.string().nullable(),
      confidence: z.enum(InitiativeConfidence).nullable(),
      effortEstimate: z.string().nullable(),
      board: z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
      }),
    }),
  ),
  totalCount: z.number().int(),
  nextCursor: z.string().nullable(),
  notice: z.string().optional(),
});

export const ListTaskLinksOutput = z.object({
  outgoing: z.array(linkedTask),
  incoming: z.array(linkedTask),
});

// ---------------------------------------------------------------------------
// P2.3 coverage tools
// ---------------------------------------------------------------------------

const snapshotTaskRow = z.object({
  id: z.string(),
  number: z.number().int(),
  key: z.string(),
  title: z.string(),
  priority: z.enum(Priority),
  dueAt: nullableIsoDate,
});

export const BoardSnapshotOutput = z.object({
  board: boardRef,
  workspaceId: z.string(),
  taskPrefix: z.string(),
  totalTasks: z.number().int(),
  columns: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      position: z.number(),
      wipLimit: z.number().int().nullable(),
      tasks: z.array(snapshotTaskRow),
    }),
  ),
  notice: z.string().optional(),
});

export const SearchTasksOutput = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      number: z.number().int(),
      key: z.string(),
      title: z.string(),
      priority: z.enum(Priority),
      dueAt: nullableIsoDate,
      updatedAt: isoDate,
      columnId: z.string(),
      columnName: z.string(),
      boardId: z.string(),
      boardName: z.string(),
      boardKind: z.enum(BoardKind),
    }),
  ),
  totalCount: z.number().int(),
  nextCursor: z.string().nullable(),
  notice: z.string().optional(),
});

export const FindSimilarTasksOutput = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      number: z.number().int(),
      key: z.string(),
      title: z.string(),
      columnName: z.string(),
      boardId: z.string(),
      boardName: z.string(),
      boardSlug: z.string(),
      boardKind: z.enum(BoardKind),
      // Cosine similarity in [0, 1]; ≥0.8 reads as a duplicate candidate.
      similarity: z.number(),
    }),
  ),
  notice: z.string().optional(),
});

export const ListActivityOutput = z.object({
  activities: z.array(
    z.object({
      id: z.string(),
      taskId: z.string(),
      taskKey: z.string(),
      type: z.string(),
      payload: z
        .unknown()
        .nullable()
        .describe('Includes `source: "ui" | "mcp"` for attribution'),
      createdAt: isoDate,
      actorId: z
        .string()
        .nullable()
        .describe("Null for system-generated activities (cron sweep)"),
      actorName: z.string().nullable(),
    }),
  ),
  totalCount: z.number().int(),
  nextCursor: z.string().nullable(),
  notice: z.string().optional(),
});

export const ListCommentsOutput = z.object({
  comments: z.array(
    z.object({
      id: z.string(),
      body: z.string(),
      editedAt: nullableIsoDate,
      createdAt: isoDate,
      author: z.object({
        id: z.string(),
        name: z.string().nullable(),
        email: z.string(),
      }),
    }),
  ),
});

export const CreateCommentOutput = z.object({ id: z.string() });

export const CreateSubtaskOutput = z.object({
  id: z.string(),
  position: z.number(),
});

export const ListAttachmentsOutput = z.object({
  attachments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mimeType: z.string(),
      size: z.number().int(),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
      createdAt: isoDate,
      uploader: z.object({ id: z.string(), name: z.string().nullable() }),
      downloadUrl: z
        .string()
        .nullable()
        .describe("Short-lived signed URL (or null if storage unconfigured)"),
    }),
  ),
  notice: z.string().optional(),
});

const labelRow = z.object({
  id: z.string(),
  boardId: z.string(),
  name: z.string(),
  color: z.string(),
});

export const ManageLabelsOutput = z.object({
  ok: z.literal(true),
  label: labelRow
    .optional()
    .describe("The created/updated label (absent for delete)"),
});

export const ManageColumnsOutput = z.object({
  ok: z.literal(true),
  column: z
    .object({ id: z.string(), name: z.string(), position: z.number() })
    .optional()
    .describe("The created column (absent for other actions)"),
});

export const CreateBoardOutput = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  kind: z.enum(BoardKind),
});

export const RenameBoardOutput = z.object({ name: z.string() });

export const BulkCreateTasksOutput = z.object({
  created: z.number().int(),
  tasks: z.array(
    z.object({
      index: z.number().int().describe("Index in the input array"),
      id: z.string(),
      number: z.number().int(),
      key: z.string(),
    }),
  ),
});

const bulkItemResult = z.object({
  taskId: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
});

export const BulkUpdateTasksOutput = z.object({
  updated: z.number().int(),
  results: z.array(bulkItemResult),
});

export const BulkMoveTasksOutput = z.object({
  moved: z.number().int(),
  results: z.array(bulkItemResult),
});

// ---------------------------------------------------------------------------
// P2.6 webhooks (admin surface)
// ---------------------------------------------------------------------------

export const CreateWebhookOutput = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.string()).describe("Subscribed events; empty = all events"),
  active: z.boolean(),
  secret: z
    .string()
    .describe(
      "HMAC-SHA256 signing secret — shown ONCE, store it now. Verify deliveries by recomputing sha256 HMAC over `${X-Stacks-Timestamp}.${rawBody}`.",
    ),
});

export const ListWebhooksOutput = z.object({
  webhooks: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      events: z.array(z.string()),
      active: z.boolean(),
      consecutiveFailures: z.number().int(),
      createdAt: isoDate,
    }),
  ),
});

export const ListWebhookDeliveriesOutput = z.object({
  deliveries: z.array(
    z.object({
      id: z.string(),
      event: z.string(),
      status: z.enum(["PENDING", "SUCCESS", "FAILED"]),
      attempts: z.number().int(),
      nextRetryAt: nullableIsoDate,
      lastError: z.string().nullable(),
      deliveredAt: nullableIsoDate,
      createdAt: isoDate,
    }),
  ),
  nextCursor: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Automations (P3.7)
// ---------------------------------------------------------------------------

import {
  ActionsSchema,
  ConditionsSchema,
  TriggerSchema,
} from "@/server/automations/schemas";

const automationRule = z.object({
  id: z.string(),
  workspaceId: z.string(),
  boardId: z.string().nullable(),
  name: z.string(),
  enabled: z.boolean(),
  trigger: TriggerSchema,
  conditions: ConditionsSchema,
  actions: ActionsSchema,
  runCount: z.number().int(),
  lastRunAt: nullableIsoDate,
  createdById: z.string(),
});

export const AutomationRuleOutput = automationRule;

export const ListAutomationsOutput = z.object({
  automations: z.array(automationRule),
});
