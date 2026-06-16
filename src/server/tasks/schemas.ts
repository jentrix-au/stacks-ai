import {
  BugSeverity,
  InitiativeConfidence,
  Priority,
  TaskLinkKind,
  TicketSeverity,
} from "@prisma/client";
import { z } from "zod";

const IsoDate = z
  .string()
  .datetime({ offset: true })
  .describe("ISO 8601 datetime (e.g. 2026-12-31T17:00:00Z).");

// Optimistic concurrency (P2.4): pass the updatedAt you last read; a stale
// value fails with CONFLICT carrying the entity's current state.
const ExpectedUpdatedAt = IsoDate.optional().describe(
  "Optimistic concurrency guard: the entity's updatedAt from your last read. If it changed since, the call fails with CONFLICT and the error embeds the current entity.",
);

export const CreateTaskSchema = z.object({
  columnId: z
    .string()
    .min(1)
    .describe("Target column. Use list_columns(boardId) to discover."),
  title: z
    .string()
    .min(1)
    .max(200)
    .describe("Short title for the task (max 200 chars)."),
  description: z
    .string()
    .max(50_000)
    .optional()
    .describe("Markdown description (optional, max 50k chars)."),
  priority: z
    .enum(Priority)
    .optional()
    .describe("Priority: LOW, MEDIUM (default), HIGH, URGENT."),
  dueAt: IsoDate.nullable().optional().describe("Due date (optional)."),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  taskId: z.string().min(1).describe("ID of the task to update."),
  title: z.string().min(1).max(200).optional().describe("New title."),
  description: z
    .string()
    .max(50_000)
    .optional()
    .describe("New markdown description."),
  priority: z.enum(Priority).optional().describe("New priority."),
  dueAt: IsoDate.nullable()
    .optional()
    .describe("New due date, or null to clear."),
  expectedUpdatedAt: ExpectedUpdatedAt,
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export const MoveTaskSchema = z.object({
  taskId: z.string().min(1).describe("ID of the task to move."),
  toColumnId: z
    .string()
    .min(1)
    .describe(
      "Destination column (must belong to same board). Moving = changing status.",
    ),
  beforeTaskId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe(
      "ID of the task to insert AFTER (provide one of beforeTaskId/afterTaskId for placement).",
    ),
  afterTaskId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("ID of the task to insert BEFORE."),
  expectedUpdatedAt: ExpectedUpdatedAt,
});
export type MoveTaskInput = z.infer<typeof MoveTaskSchema>;

export const ArchiveTaskSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe("ID of the task to archive (soft delete)."),
});
export type ArchiveTaskInput = z.infer<typeof ArchiveTaskSchema>;

export const SetTaskLabelsSchema = z.object({
  taskId: z.string().min(1).describe("ID of the task."),
  labelIds: z
    .array(z.string().min(1))
    .describe(
      "Full list of label IDs to apply. REPLACES all existing labels — pass current+new to add, pass current-removed to delete.",
    ),
});
export type SetTaskLabelsInput = z.infer<typeof SetTaskLabelsSchema>;

export const SetTaskAssigneesSchema = z.object({
  taskId: z.string().min(1).describe("ID of the task."),
  userIds: z
    .array(z.string().min(1))
    .describe(
      "Full list of user IDs to assign. REPLACES all existing assignees. All users must be members of the task's workspace.",
    ),
});
export type SetTaskAssigneesInput = z.infer<typeof SetTaskAssigneesSchema>;

// CRM: deal + contact-link inputs (boards with kind=CRM).

export const UpdateDealSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe(
      "ID of the task whose Deal sidecar to update (board must be kind=CRM).",
    ),
  amount: z
    .number()
    .nonnegative()
    .nullable()
    .optional()
    .describe(
      "Deal amount (decimal, max 15 digits, 2 decimals). Null to clear.",
    ),
  currency: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase())
    .nullable()
    .optional()
    .describe("ISO 4217 currency code (USD, EUR, ...). Null to clear."),
  expectedCloseAt: IsoDate.nullable()
    .optional()
    .describe("Expected close date. Null to clear."),
  expectedUpdatedAt: ExpectedUpdatedAt,
});
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;

export const SetDealContactsSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe("ID of the task (board must be kind=CRM)."),
  contactIds: z
    .array(z.string().min(1))
    .describe(
      "Full list of contact IDs to attach to this deal. REPLACES all existing contacts — pass current+new to add one, pass current-removed to remove one, pass [] to clear. Every contact must belong to the same workspace as the task and not be archived.",
    ),
});
export type SetDealContactsInput = z.infer<typeof SetDealContactsSchema>;

// BUGS: bug-report sidecar (boards with kind=BUGS).

export const UpdateBugReportSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe(
      "ID of the task whose BugReport sidecar to update (board must be kind=BUGS).",
    ),
  severity: z
    .enum(BugSeverity)
    .nullable()
    .optional()
    .describe(
      "Bug severity (TRIVIAL/MINOR/MAJOR/CRITICAL/BLOCKER). Null to clear.",
    ),
  reproSteps: z
    .string()
    .max(20_000)
    .nullable()
    .optional()
    .describe("Steps to reproduce (markdown). Null to clear."),
  expectedBehavior: z
    .string()
    .max(20_000)
    .nullable()
    .optional()
    .describe("Expected behavior (markdown). Null to clear."),
  actualBehavior: z
    .string()
    .max(20_000)
    .nullable()
    .optional()
    .describe("Actual behavior observed (markdown). Null to clear."),
  affectedVersion: z
    .string()
    .max(120)
    .nullable()
    .optional()
    .describe('Affected version (e.g. "1.4.2"). Null to clear.'),
  environment: z
    .string()
    .max(255)
    .nullable()
    .optional()
    .describe(
      'Environment / platform (e.g. "macOS 14 / Chrome 122"). Null to clear.',
    ),
  resolvedAt: IsoDate.nullable()
    .optional()
    .describe("Resolution timestamp. Set to mark resolved; null to reopen."),
  expectedUpdatedAt: ExpectedUpdatedAt,
});
export type UpdateBugReportInput = z.infer<typeof UpdateBugReportSchema>;

// SUPPORT: ticket sidecar + contact-link inputs (boards with kind=SUPPORT).

export const UpdateTicketSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe(
      "ID of the task whose Ticket sidecar to update (board must be kind=SUPPORT).",
    ),
  severity: z
    .enum(TicketSeverity)
    .nullable()
    .optional()
    .describe("Ticket severity (LOW/NORMAL/HIGH/URGENT). Null to clear."),
  slaDueAt: IsoDate.nullable()
    .optional()
    .describe("SLA deadline. Null to clear."),
  firstResponseAt: IsoDate.nullable()
    .optional()
    .describe("First response timestamp. Null to clear."),
  resolvedAt: IsoDate.nullable()
    .optional()
    .describe("Resolution timestamp. Null to clear."),
  source: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .describe('Source channel (e.g. "email", "chat", "phone"). Null to clear.'),
  expectedUpdatedAt: ExpectedUpdatedAt,
});
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;

export const LinkTicketContactSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe("ID of the task (board must be kind=SUPPORT)."),
  contactId: z
    .string()
    .min(1)
    .nullable()
    .describe(
      "Workspace contact to link to this ticket, or null to unlink. Contact must belong to the same workspace as the task and not be archived.",
    ),
});
export type LinkTicketContactInput = z.infer<typeof LinkTicketContactSchema>;

// ROADMAP: initiative sidecar + dependency-graph inputs (boards with kind=ROADMAP).

export const UpdateInitiativeSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe(
      "ID of the task whose Initiative sidecar to update (board must be kind=ROADMAP).",
    ),
  targetQuarter: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .describe('Target quarter (e.g. "2026-Q2"). Null to clear.'),
  confidence: z
    .enum(InitiativeConfidence)
    .nullable()
    .optional()
    .describe("Confidence in delivery (LOW/MEDIUM/HIGH). Null to clear."),
  effortEstimate: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .describe(
      'Effort estimate (e.g. "S"/"M"/"L"/"XL" or hours). Null to clear.',
    ),
  rice: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .describe(
      "Optional RICE prioritization fields (free-form object). Null to clear.",
    ),
  expectedUpdatedAt: ExpectedUpdatedAt,
});
export type UpdateInitiativeInput = z.infer<typeof UpdateInitiativeSchema>;

// Task links: universal graph edges between tasks of any board kind
// (same workspace only).

export const AddTaskLinkSchema = z.object({
  fromTaskId: z
    .string()
    .min(1)
    .describe("Task ID on the FROM side of the edge (any board kind)."),
  toTaskId: z
    .string()
    .min(1)
    .describe(
      "Task ID on the TO side of the edge (any board kind, same workspace).",
    ),
  kind: z
    .enum(TaskLinkKind)
    .describe(
      "Edge kind: BLOCKS (from blocks to), DEPENDS_ON (from depends on to), RELATES_TO (bidirectional marker), or DUPLICATES (from duplicates to). Only BLOCKS/DEPENDS_ON participate in cycle detection.",
    ),
});
export type AddTaskLinkInput = z.infer<typeof AddTaskLinkSchema>;

export const RemoveTaskLinkSchema = z.object({
  fromTaskId: z.string().min(1).describe("Task ID on the FROM side."),
  toTaskId: z.string().min(1).describe("Task ID on the TO side."),
  kind: z
    .enum(TaskLinkKind)
    .describe("Edge kind to remove (BLOCKS/DEPENDS_ON/RELATES_TO/DUPLICATES)."),
});
export type RemoveTaskLinkInput = z.infer<typeof RemoveTaskLinkSchema>;

export const ListTaskLinksSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe("Task whose outgoing and incoming links to list."),
});
export type ListTaskLinksInput = z.infer<typeof ListTaskLinksSchema>;

// Bulk operations (single transaction per call, max 50 items, per-item
// result arrays). Exposed via MCP only — the UI uses single-item actions.

export const BulkCreateTasksSchema = z.object({
  columnId: z
    .string()
    .min(1)
    .describe("Target column for ALL created tasks (one column per call)."),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200).describe("Task title."),
        description: z
          .string()
          .max(50_000)
          .optional()
          .describe("Markdown description (optional)."),
        priority: z
          .enum(Priority)
          .optional()
          .describe("Priority: LOW, MEDIUM (default), HIGH, URGENT."),
        dueAt: IsoDate.nullable().optional().describe("Due date (optional)."),
      }),
    )
    .min(1)
    .max(50)
    .describe("Tasks to create, in order (max 50)."),
});
export type BulkCreateTasksInput = z.infer<typeof BulkCreateTasksSchema>;

export const BulkUpdateTasksSchema = z.object({
  updates: z
    .array(UpdateTaskSchema)
    .min(1)
    .max(50)
    .describe(
      "Per-task updates (max 50). Each entry needs taskId; only provided fields change.",
    ),
});
export type BulkUpdateTasksInput = z.infer<typeof BulkUpdateTasksSchema>;

export const BulkMoveTasksSchema = z.object({
  moves: z
    .array(
      z.object({
        taskId: z.string().min(1).describe("Task to move."),
        toColumnId: z
          .string()
          .min(1)
          .describe("Destination column (same board as the task)."),
      }),
    )
    .min(1)
    .max(50)
    .describe(
      "Moves to apply in order (max 50). Each task is appended to the end of its destination column.",
    ),
});
export type BulkMoveTasksInput = z.infer<typeof BulkMoveTasksSchema>;

export const ListInitiativesSchema = z.object({
  workspaceId: z.string().min(1).describe("Workspace ID."),
  query: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe(
      "Substring filter applied to the initiative's task title (case-insensitive).",
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
});
export type ListInitiativesInput = z.infer<typeof ListInitiativesSchema>;
