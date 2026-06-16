import type React from "react";
import { ActivityType } from "@/lib/enums";
import {
  ArrowRight,
  CalendarClock,
  Archive,
  Bug,
  Calendar as CalendarIcon,
  CheckSquare,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  Contact,
  GitBranchPlus,
  GitMerge,
  LifeBuoy,
  Map,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Tag,
  User,
  UserMinus,
  UserPlus,
  Zap,
} from "lucide-react";

/**
 * Human verb + icon per ActivityType. Shared by the task activity feed
 * (client) and the workspace-home recent-activity digest (server) — keep it
 * in lib/ (no "use client") so both can import it.
 */
export const ACTIVITY_VERBS: Record<
  ActivityType,
  { label: string; icon: React.ElementType }
> = {
  TASK_CREATED: { label: "created this task", icon: Plus },
  TASK_UPDATED: { label: "updated the task", icon: Pencil },
  TASK_MOVED: { label: "moved this task", icon: ArrowRight },
  TASK_ARCHIVED: { label: "archived this task", icon: Archive },
  TASK_RESTORED: { label: "restored this task", icon: Archive },
  LABEL_ADDED: { label: "added a label", icon: Tag },
  LABEL_REMOVED: { label: "removed a label", icon: Tag },
  ASSIGNEE_ADDED: { label: "assigned a member", icon: UserPlus },
  ASSIGNEE_REMOVED: { label: "unassigned a member", icon: UserMinus },
  DUE_DATE_SET: { label: "set a due date", icon: CalendarIcon },
  DUE_DATE_CLEARED: { label: "cleared the due date", icon: CalendarIcon },
  PRIORITY_CHANGED: { label: "changed priority", icon: Pencil },
  COMMENT_CREATED: { label: "commented", icon: MessageSquare },
  COMMENT_EDITED: { label: "edited a comment", icon: Pencil },
  COMMENT_DELETED: { label: "deleted a comment", icon: MessageSquare },
  ATTACHMENT_ADDED: { label: "attached a file", icon: Paperclip },
  ATTACHMENT_REMOVED: { label: "removed an attachment", icon: Paperclip },
  SUBTASK_ADDED: { label: "added a subtask", icon: CheckSquare },
  SUBTASK_COMPLETED: { label: "completed a subtask", icon: CheckSquare },
  DEAL_UPDATED: { label: "updated the deal", icon: CircleDollarSign },
  CONTACT_LINKED: { label: "linked a contact", icon: Contact },
  CONTACT_UNLINKED: { label: "unlinked the contact", icon: Contact },
  BUG_UPDATED: { label: "updated the bug", icon: Bug },
  BUG_RESOLVED: { label: "marked the bug resolved", icon: CircleCheck },
  BUG_REOPENED: { label: "reopened the bug", icon: CircleX },
  TICKET_UPDATED: { label: "updated the ticket", icon: LifeBuoy },
  CUSTOMER_LINKED: { label: "linked a customer", icon: User },
  CUSTOMER_UNLINKED: { label: "unlinked the customer", icon: User },
  INITIATIVE_UPDATED: { label: "updated the initiative", icon: Map },
  DEPENDENCY_ADDED: { label: "added a dependency", icon: GitBranchPlus },
  DEPENDENCY_REMOVED: { label: "removed a dependency", icon: GitMerge },
  SLA_BREACHED: { label: "SLA breached on this ticket", icon: CalendarClock },
  AUTOMATION_RAN: { label: "ran an automation", icon: Zap },
};
