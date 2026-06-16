"use server";

import { requireUser } from "@/lib/session";
import { requireTaskAccess } from "@/lib/authz";
import { listTaskAttachments } from "@/server/queries/attachments";

export async function fetchTaskAttachments(taskId: string) {
  const user = await requireUser();
  await requireTaskAccess(user.id, taskId);
  return listTaskAttachments(taskId);
}
