"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as labelOps from "@/server/labels/operations";
import {
  CreateLabelSchema,
  DeleteLabelSchema,
  UpdateLabelSchema,
} from "@/server/labels/schemas";

export async function createLabel(input: z.infer<typeof CreateLabelSchema>) {
  const user = await requireUser();
  return labelOps.createLabel(user.id, CreateLabelSchema.parse(input));
}

export async function updateLabel(input: z.infer<typeof UpdateLabelSchema>) {
  const user = await requireUser();
  return labelOps.updateLabel(user.id, UpdateLabelSchema.parse(input));
}

export async function deleteLabel(input: z.infer<typeof DeleteLabelSchema>) {
  const user = await requireUser();
  await labelOps.deleteLabel(user.id, DeleteLabelSchema.parse(input));
}
