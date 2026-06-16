import { ActivityType, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { emitBoardEvent } from "@/lib/events";
import type { ActivitySource } from "@/server/activity";
import {
  ActionsSchema,
  ConditionsSchema,
  TriggerSchema,
  type Action,
  type Conditions,
  type Trigger,
} from "./schemas";

/**
 * The automation executor (P3.7). Ops dispatch AutomationEvents post-commit;
 * matching enabled rules run their actions THROUGH the ops core as the rule's
 * creator with source "automation". The hard one-level loop guard:
 * automation-sourced events return immediately, so a rule can never trigger
 * itself or another rule.
 */

export type AutomationEventKind =
  | "task.created"
  | "task.moved_to_column"
  | "label.added"
  | "due.passed"
  | "sla.breached";

export interface AutomationEvent {
  kind: AutomationEventKind;
  taskId: string;
  boardId: string;
  workspaceId: string;
  /** Destination column for task.moved_to_column. */
  columnId?: string;
  /** The label for label.added. */
  labelId?: string;
  /** "system" = cron sweep. Anything "automation" is dropped (loop guard). */
  source: ActivitySource | "system";
}

/** Facts the condition predicates evaluate against. */
export interface TaskFacts {
  priority: string;
  labelIds: string[];
  assigneeIds: string[];
  bugSeverity: string | null;
  ticketSeverity: string | null;
}

export function triggerMatches(trigger: Trigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.kind) return false;
  if (trigger.type === "task.moved_to_column" && trigger.columnId) {
    return trigger.columnId === event.columnId;
  }
  if (trigger.type === "label.added" && trigger.labelId) {
    return trigger.labelId === event.labelId;
  }
  return true;
}

export function conditionsMatch(
  conditions: Conditions,
  facts: TaskFacts,
): boolean {
  if (conditions.priorityIn && !conditions.priorityIn.includes(facts.priority as never))
    return false;
  if (conditions.hasLabelId && !facts.labelIds.includes(conditions.hasLabelId))
    return false;
  if (conditions.assigneeId && !facts.assigneeIds.includes(conditions.assigneeId))
    return false;
  if (conditions.unassigned && facts.assigneeIds.length > 0) return false;
  if (
    conditions.bugSeverityIn &&
    !conditions.bugSeverityIn.includes(facts.bugSeverity as never)
  )
    return false;
  if (
    conditions.ticketSeverityIn &&
    !conditions.ticketSeverityIn.includes(facts.ticketSeverity as never)
  )
    return false;
  return true;
}

async function loadTaskFacts(taskId: string): Promise<TaskFacts | null> {
  const task = await db.task.findFirst({
    where: {
      id: taskId,
      archivedAt: null,
      column: { archivedAt: null, board: { archivedAt: null } },
    },
    select: {
      priority: true,
      labels: { select: { labelId: true } },
      assignees: { select: { userId: true } },
      bugReport: { select: { severity: true } },
      ticket: { select: { severity: true } },
    },
  });
  if (!task) return null;
  return {
    priority: task.priority,
    labelIds: task.labels.map((l) => l.labelId),
    assigneeIds: task.assignees.map((a) => a.userId),
    bugSeverity: task.bugReport?.severity ?? null,
    ticketSeverity: task.ticket?.severity ?? null,
  };
}

async function runAction(
  action: Action,
  rule: { id: string; name: string; createdById: string },
  event: AutomationEvent,
): Promise<void> {
  // Lazy imports avoid a static cycle (ops import the engine to dispatch).
  const ops = await import("@/server/tasks/operations");
  const commentOps = await import("@/server/comments/operations");
  const actorId = rule.createdById;

  switch (action.type) {
    case "move_to_column":
      await ops.moveTask(
        actorId,
        { taskId: event.taskId, toColumnId: action.columnId },
        "automation",
      );
      break;
    case "set_priority":
      await ops.updateTask(
        actorId,
        { taskId: event.taskId, priority: action.priority },
        "automation",
      );
      break;
    case "add_label": {
      const facts = await loadTaskFacts(event.taskId);
      if (!facts || facts.labelIds.includes(action.labelId)) break;
      await ops.setTaskLabels(
        actorId,
        { taskId: event.taskId, labelIds: [...facts.labelIds, action.labelId] },
        "automation",
      );
      break;
    }
    case "assign": {
      const facts = await loadTaskFacts(event.taskId);
      if (!facts || facts.assigneeIds.includes(action.userId)) break;
      // setTaskAssignees dispatches no automation events, so no source param.
      await ops.setTaskAssignees(actorId, {
        taskId: event.taskId,
        userIds: [...facts.assigneeIds, action.userId],
      });
      break;
    }
    case "comment":
      await commentOps.createComment(
        actorId,
        { taskId: event.taskId, body: action.body },
        "automation",
      );
      break;
    case "fire_webhook":
      await emitBoardEvent(event.boardId, "automation.fired", {
        taskId: event.taskId,
        ruleId: rule.id,
        ruleName: rule.name,
        triggeredBy: event.kind,
      });
      break;
    case "create_task":
      await ops.createTask(
        actorId,
        { columnId: action.columnId, title: action.title },
        "automation",
      );
      break;
  }
}

/**
 * Entry point called by the ops pipeline post-commit. Never throws — an
 * automation failure must not break the originating mutation.
 */
export async function dispatchAutomationEvent(
  event: AutomationEvent,
): Promise<void> {
  // HARD LOOP GUARD: whatever an automation does never triggers automations.
  if (event.source === "automation") return;
  try {
    const rules = await db.automationRule.findMany({
      where: {
        enabled: true,
        workspaceId: event.workspaceId,
        OR: [{ boardId: null }, { boardId: event.boardId }],
      },
    });
    if (rules.length === 0) return;

    for (const rule of rules) {
      const trigger = TriggerSchema.safeParse(rule.trigger);
      if (!trigger.success || !triggerMatches(trigger.data, event)) continue;
      const conditions = ConditionsSchema.safeParse(rule.conditions ?? {});
      const actions = ActionsSchema.safeParse(rule.actions);
      if (!conditions.success || !actions.success) continue;

      const facts = await loadTaskFacts(event.taskId);
      if (!facts || !conditionsMatch(conditions.data, facts)) continue;

      for (const action of actions.data) {
        try {
          await runAction(action, rule, event);
        } catch (e) {
          console.error(
            `automation "${rule.name}" (${rule.id}) action ${action.type} failed`,
            e,
          );
        }
      }

      await db.$transaction([
        db.automationRule.update({
          where: { id: rule.id },
          data: { runCount: { increment: 1 }, lastRunAt: new Date() },
        }),
        db.activity.create({
          data: {
            taskId: event.taskId,
            actorId: null,
            type: ActivityType.AUTOMATION_RAN,
            payload: {
              source: "automation",
              ruleId: rule.id,
              ruleName: rule.name,
              triggeredBy: event.kind,
            } as Prisma.InputJsonValue,
          },
        }),
      ]);
    }
  } catch (e) {
    console.error("automation dispatch failed", e);
  }
}
