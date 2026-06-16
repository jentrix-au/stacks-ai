"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as ops from "@/server/tasks/operations";
import {
  AddTaskLinkSchema,
  RemoveTaskLinkSchema,
} from "@/server/tasks/schemas";

export async function addTaskLink(input: z.infer<typeof AddTaskLinkSchema>) {
  const user = await requireUser();
  return ops.addTaskLink(user.id, AddTaskLinkSchema.parse(input), "ui");
}

export async function removeTaskLink(
  input: z.infer<typeof RemoveTaskLinkSchema>,
) {
  const user = await requireUser();
  return ops.removeTaskLink(user.id, RemoveTaskLinkSchema.parse(input), "ui");
}
