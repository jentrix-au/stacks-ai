"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as ops from "@/server/tasks/operations";
import {
  BulkMoveTasksSchema,
  BulkUpdateTasksSchema,
  CreateTaskSchema,
  MoveTaskSchema,
  SetTaskAssigneesSchema,
  SetTaskLabelsSchema,
  UpdateTaskSchema,
} from "@/server/tasks/schemas";

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const input = CreateTaskSchema.parse({
    columnId: formData.get("columnId"),
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
  });
  return ops.createTask(user.id, input, "ui");
}

export async function updateTask(input: z.infer<typeof UpdateTaskSchema>) {
  const user = await requireUser();
  return ops.updateTask(user.id, UpdateTaskSchema.parse(input), "ui");
}

export async function moveTask(input: z.infer<typeof MoveTaskSchema>) {
  const user = await requireUser();
  return ops.moveTask(user.id, MoveTaskSchema.parse(input), "ui");
}

export async function archiveTask(formData: FormData) {
  const user = await requireUser();
  const taskId = z.string().min(1).parse(formData.get("taskId"));
  return ops.archiveTask(user.id, { taskId }, "ui");
}

export async function setTaskLabels(
  input: z.infer<typeof SetTaskLabelsSchema>,
) {
  const user = await requireUser();
  return ops.setTaskLabels(user.id, SetTaskLabelsSchema.parse(input));
}

export async function setTaskAssignees(
  input: z.infer<typeof SetTaskAssigneesSchema>,
) {
  const user = await requireUser();
  return ops.setTaskAssignees(user.id, SetTaskAssigneesSchema.parse(input));
}

// Bulk-edit UI (P3.8) over the P2.3 bulk ops.

export async function bulkUpdateTasks(
  input: z.infer<typeof BulkUpdateTasksSchema>,
) {
  const user = await requireUser();
  return ops.bulkUpdateTasks(user.id, BulkUpdateTasksSchema.parse(input), "ui");
}

export async function bulkMoveTasks(
  input: z.infer<typeof BulkMoveTasksSchema>,
) {
  const user = await requireUser();
  return ops.bulkMoveTasks(user.id, BulkMoveTasksSchema.parse(input), "ui");
}
