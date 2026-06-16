"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as ops from "@/server/tasks/operations";
import { UpdateInitiativeSchema } from "@/server/tasks/schemas";

export async function updateInitiative(
  input: z.infer<typeof UpdateInitiativeSchema>,
) {
  const user = await requireUser();
  return ops.updateInitiative(
    user.id,
    UpdateInitiativeSchema.parse(input),
    "ui",
  );
}
