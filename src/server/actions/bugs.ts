"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as ops from "@/server/tasks/operations";
import { UpdateBugReportSchema } from "@/server/tasks/schemas";

export async function updateBugReport(
  input: z.infer<typeof UpdateBugReportSchema>,
) {
  const user = await requireUser();
  return ops.updateBugReport(user.id, UpdateBugReportSchema.parse(input), "ui");
}
