"use server";

import { requireUser } from "@/lib/session";
import { requireTaskAccess } from "@/lib/authz";
import { listTaskActivity } from "@/server/queries/activity";

export async function fetchTaskActivity(taskId: string) {
  const user = await requireUser();
  await requireTaskAccess(user.id, taskId);
  return listTaskActivity(taskId);
}
