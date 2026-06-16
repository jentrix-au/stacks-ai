import { z } from "zod";
import { BugSeverity, Priority, TicketSeverity } from "@prisma/client";

/**
 * Automations v1 (P3.7). trigger/conditions/actions persist as Json on
 * AutomationRule, validated by these schemas at write time AND re-parsed at
 * execution time (a rule that fails to parse is skipped, never crashes the
 * pipeline).
 */

export const TriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.created") }),
  z.object({
    type: z.literal("task.moved_to_column"),
    // Omitted = any column on the rule's board.
    columnId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("label.added"),
    labelId: z.string().min(1).optional(),
  }),
  z.object({ type: z.literal("due.passed") }),
  z.object({ type: z.literal("sla.breached") }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;
export type TriggerType = Trigger["type"];

export const ConditionsSchema = z.object({
  priorityIn: z.array(z.enum(Priority)).optional(),
  hasLabelId: z.string().min(1).optional(),
  assigneeId: z.string().min(1).optional(),
  unassigned: z.boolean().optional(),
  bugSeverityIn: z.array(z.enum(BugSeverity)).optional(),
  ticketSeverityIn: z.array(z.enum(TicketSeverity)).optional(),
});
export type Conditions = z.infer<typeof ConditionsSchema>;

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move_to_column"), columnId: z.string().min(1) }),
  z.object({ type: z.literal("set_priority"), priority: z.enum(Priority) }),
  z.object({ type: z.literal("add_label"), labelId: z.string().min(1) }),
  z.object({ type: z.literal("assign"), userId: z.string().min(1) }),
  z.object({ type: z.literal("comment"), body: z.string().min(1).max(2000) }),
  // Emits an "automation.fired" board event — workspace webhooks subscribed
  // to it receive the payload.
  z.object({ type: z.literal("fire_webhook") }),
  z.object({
    type: z.literal("create_task"),
    columnId: z.string().min(1),
    title: z.string().min(1).max(200),
  }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const ActionsSchema = z.array(ActionSchema).min(1).max(10);

export const CreateAutomationSchema = z.object({
  workspaceId: z.string().min(1),
  boardId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Scope the rule to one board; null/omitted = whole workspace."),
  name: z.string().min(1).max(120),
  trigger: TriggerSchema,
  conditions: ConditionsSchema.default({}),
  actions: ActionsSchema,
  enabled: z.boolean().default(true),
});
export type CreateAutomationInput = z.infer<typeof CreateAutomationSchema>;

export const SetAutomationEnabledSchema = z.object({
  ruleId: z.string().min(1),
  enabled: z.boolean(),
});
export type SetAutomationEnabledInput = z.infer<
  typeof SetAutomationEnabledSchema
>;

export const DeleteAutomationSchema = z.object({
  ruleId: z.string().min(1),
});
export type DeleteAutomationInput = z.infer<typeof DeleteAutomationSchema>;

export const ListAutomationsSchema = z.object({
  workspaceId: z.string().min(1),
  boardId: z
    .string()
    .min(1)
    .optional()
    .describe("Filter to rules scoped to this board (plus workspace-wide ones)."),
});
export type ListAutomationsInput = z.infer<typeof ListAutomationsSchema>;
