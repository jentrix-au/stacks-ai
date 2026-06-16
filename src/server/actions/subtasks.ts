"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as subtaskOps from "@/server/subtasks/operations";
import {
  CreateSubtaskSchema,
  DeleteSubtaskSchema,
  RenameSubtaskSchema,
  ReorderSubtaskSchema,
  ToggleSubtaskSchema,
} from "@/server/subtasks/schemas";

export async function createSubtask(
  input: z.infer<typeof CreateSubtaskSchema>,
) {
  const user = await requireUser();
  return subtaskOps.createSubtask(
    user.id,
    CreateSubtaskSchema.parse(input),
    "ui",
  );
}

export async function toggleSubtask(
  input: z.infer<typeof ToggleSubtaskSchema>,
) {
  const user = await requireUser();
  await subtaskOps.toggleSubtask(
    user.id,
    ToggleSubtaskSchema.parse(input),
    "ui",
  );
}

export async function renameSubtask(
  input: z.infer<typeof RenameSubtaskSchema>,
) {
  const user = await requireUser();
  await subtaskOps.renameSubtask(user.id, RenameSubtaskSchema.parse(input));
}

export async function deleteSubtask(
  input: z.infer<typeof DeleteSubtaskSchema>,
) {
  const user = await requireUser();
  await subtaskOps.deleteSubtask(user.id, DeleteSubtaskSchema.parse(input));
}

export async function reorderSubtask(
  input: z.infer<typeof ReorderSubtaskSchema>,
) {
  const user = await requireUser();
  await subtaskOps.reorderSubtask(user.id, ReorderSubtaskSchema.parse(input));
}
