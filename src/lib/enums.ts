/**
 * Client-safe mirrors of Prisma enums.
 *
 * Why this file exists: importing enum values from `@prisma/client` in a
 * Client Component pulls Prisma's browser shim into the JS bundle. The shim
 * references generated files (`.prisma/client/index-browser`) that may not
 * exist in CI without `prisma generate`, AND it bloats the bundle for no
 * reason — these enums are just string constants.
 *
 * Keep these in sync with `prisma/schema.prisma`. If the schema ever drifts,
 * the type cast on the const object will start failing in server code that
 * imports both.
 */

export const Priority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const Role = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ActivityType = {
  TASK_CREATED: "TASK_CREATED",
  TASK_UPDATED: "TASK_UPDATED",
  TASK_MOVED: "TASK_MOVED",
  TASK_ARCHIVED: "TASK_ARCHIVED",
  TASK_RESTORED: "TASK_RESTORED",
  LABEL_ADDED: "LABEL_ADDED",
  LABEL_REMOVED: "LABEL_REMOVED",
  ASSIGNEE_ADDED: "ASSIGNEE_ADDED",
  ASSIGNEE_REMOVED: "ASSIGNEE_REMOVED",
  DUE_DATE_SET: "DUE_DATE_SET",
  DUE_DATE_CLEARED: "DUE_DATE_CLEARED",
  PRIORITY_CHANGED: "PRIORITY_CHANGED",
  COMMENT_CREATED: "COMMENT_CREATED",
  COMMENT_EDITED: "COMMENT_EDITED",
  COMMENT_DELETED: "COMMENT_DELETED",
  ATTACHMENT_ADDED: "ATTACHMENT_ADDED",
  ATTACHMENT_REMOVED: "ATTACHMENT_REMOVED",
  SUBTASK_ADDED: "SUBTASK_ADDED",
  SUBTASK_COMPLETED: "SUBTASK_COMPLETED",
  DEAL_UPDATED: "DEAL_UPDATED",
  CONTACT_LINKED: "CONTACT_LINKED",
  CONTACT_UNLINKED: "CONTACT_UNLINKED",
  BUG_UPDATED: "BUG_UPDATED",
  BUG_RESOLVED: "BUG_RESOLVED",
  BUG_REOPENED: "BUG_REOPENED",
  TICKET_UPDATED: "TICKET_UPDATED",
  CUSTOMER_LINKED: "CUSTOMER_LINKED",
  CUSTOMER_UNLINKED: "CUSTOMER_UNLINKED",
  INITIATIVE_UPDATED: "INITIATIVE_UPDATED",
  DEPENDENCY_ADDED: "DEPENDENCY_ADDED",
  DEPENDENCY_REMOVED: "DEPENDENCY_REMOVED",
  SLA_BREACHED: "SLA_BREACHED",
  AUTOMATION_RAN: "AUTOMATION_RAN",
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const BugSeverity = {
  TRIVIAL: "TRIVIAL",
  MINOR: "MINOR",
  MAJOR: "MAJOR",
  CRITICAL: "CRITICAL",
  BLOCKER: "BLOCKER",
} as const;
export type BugSeverity = (typeof BugSeverity)[keyof typeof BugSeverity];

export const TicketSeverity = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type TicketSeverity =
  (typeof TicketSeverity)[keyof typeof TicketSeverity];

export const InitiativeConfidence = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;
export type InitiativeConfidence =
  (typeof InitiativeConfidence)[keyof typeof InitiativeConfidence];

export const TaskLinkKind = {
  BLOCKS: "BLOCKS",
  DEPENDS_ON: "DEPENDS_ON",
  RELATES_TO: "RELATES_TO",
  DUPLICATES: "DUPLICATES",
} as const;
export type TaskLinkKind = (typeof TaskLinkKind)[keyof typeof TaskLinkKind];

export const BoardKind = {
  TASKS: "TASKS",
  CRM: "CRM",
  SUPPORT: "SUPPORT",
  BUGS: "BUGS",
  ROADMAP: "ROADMAP",
} as const;
export type BoardKind = (typeof BoardKind)[keyof typeof BoardKind];

export const AttachmentStatus = {
  PENDING: "PENDING",
  READY: "READY",
  FAILED: "FAILED",
} as const;
export type AttachmentStatus =
  (typeof AttachmentStatus)[keyof typeof AttachmentStatus];
