import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { AuthzError, requireBoardAccess, requireWorkspaceRole } from "@/lib/authz";
import type {
  Action,
  Conditions,
  CreateAutomationInput,
  DeleteAutomationInput,
  ListAutomationsInput,
  SetAutomationEnabledInput,
  Trigger,
} from "./schemas";

/**
 * Automation rule management (P3.7). Listing needs MEMBER; creating,
 * toggling, and deleting need ADMIN (rules act with the creator's identity,
 * so they're as powerful as a member session). No Activity rows — rules are
 * board configuration, not task-graph data; runs DO write AUTOMATION_RAN.
 */

export interface AutomationRuleSummary {
  id: string;
  workspaceId: string;
  boardId: string | null;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Conditions;
  actions: Action[];
  runCount: number;
  lastRunAt: string | null;
  createdById: string;
}

function toSummary(rule: {
  id: string;
  workspaceId: string;
  boardId: string | null;
  name: string;
  enabled: boolean;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
  runCount: number;
  lastRunAt: Date | null;
  createdById: string;
}): AutomationRuleSummary {
  return {
    id: rule.id,
    workspaceId: rule.workspaceId,
    boardId: rule.boardId,
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.trigger as Trigger,
    conditions: (rule.conditions ?? {}) as Conditions,
    actions: rule.actions as Action[],
    runCount: rule.runCount,
    lastRunAt: rule.lastRunAt ? rule.lastRunAt.toISOString() : null,
    createdById: rule.createdById,
  };
}

export async function listAutomations(
  userId: string,
  input: ListAutomationsInput,
): Promise<{ automations: AutomationRuleSummary[] }> {
  await requireWorkspaceRole(userId, input.workspaceId);
  const rules = await db.automationRule.findMany({
    where: {
      workspaceId: input.workspaceId,
      ...(input.boardId
        ? { OR: [{ boardId: input.boardId }, { boardId: null }] }
        : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  return { automations: rules.map(toSummary) };
}

export async function createAutomation(
  userId: string,
  input: CreateAutomationInput,
): Promise<AutomationRuleSummary> {
  await requireWorkspaceRole(userId, input.workspaceId, Role.ADMIN);
  if (input.boardId) {
    const board = await requireBoardAccess(userId, input.boardId, Role.ADMIN);
    if (board.workspaceId !== input.workspaceId)
      throw new AuthzError("Board is not in that workspace", 400);
  }
  const rule = await db.automationRule.create({
    data: {
      workspaceId: input.workspaceId,
      boardId: input.boardId ?? null,
      name: input.name,
      enabled: input.enabled,
      trigger: input.trigger,
      conditions: input.conditions,
      actions: input.actions,
      createdById: userId,
    },
  });
  return toSummary(rule);
}

async function requireRuleAdmin(userId: string, ruleId: string) {
  const rule = await db.automationRule.findUnique({
    where: { id: ruleId },
    select: { id: true, workspaceId: true },
  });
  if (!rule) throw new AuthzError("Automation rule not found", 404);
  await requireWorkspaceRole(userId, rule.workspaceId, Role.ADMIN);
  return rule;
}

export async function setAutomationEnabled(
  userId: string,
  input: SetAutomationEnabledInput,
): Promise<AutomationRuleSummary> {
  const rule = await requireRuleAdmin(userId, input.ruleId);
  const updated = await db.automationRule.update({
    where: { id: rule.id },
    data: { enabled: input.enabled },
  });
  return toSummary(updated);
}

export async function deleteAutomation(
  userId: string,
  input: DeleteAutomationInput,
): Promise<void> {
  const rule = await requireRuleAdmin(userId, input.ruleId);
  await db.automationRule.delete({ where: { id: rule.id } });
}
