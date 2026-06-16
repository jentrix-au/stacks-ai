"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as viewOps from "@/server/views/operations";
import {
  CreateSavedViewSchema,
  DeleteSavedViewSchema,
} from "@/server/views/schemas";

export async function createSavedView(
  input: z.infer<typeof CreateSavedViewSchema>,
) {
  const user = await requireUser();
  return viewOps.createSavedView(user.id, CreateSavedViewSchema.parse(input));
}

export async function deleteSavedView(
  input: z.infer<typeof DeleteSavedViewSchema>,
) {
  const user = await requireUser();
  await viewOps.deleteSavedView(user.id, DeleteSavedViewSchema.parse(input));
}
