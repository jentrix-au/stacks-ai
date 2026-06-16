"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/session";
import {
  markAllNotificationsRead,
  markNotificationsRead,
  setNotifyEmail,
} from "@/server/notifications";

const MarkRead = z.object({ ids: z.array(z.string().min(1)).max(100) });

/** Mark specific notifications read (own rows only — enforced in the query). */
export async function markNotificationsReadAction(
  input: z.infer<typeof MarkRead>,
) {
  const user = await requireUser();
  await markNotificationsRead(user.id, MarkRead.parse(input).ids);
}

const MarkAllRead = z.object({
  workspaceId: z.string().min(1),
  workspaceSlug: z.string().min(1),
});

export async function markAllNotificationsReadAction(formData: FormData) {
  const user = await requireUser();
  const data = MarkAllRead.parse({
    workspaceId: formData.get("workspaceId"),
    workspaceSlug: formData.get("workspaceSlug"),
  });
  await markAllNotificationsRead(user.id, data.workspaceId);
  revalidatePath(`/${data.workspaceSlug}/inbox`);
  revalidatePath(`/${data.workspaceSlug}`, "layout");
}

const SetNotifyEmail = z.object({ enabled: z.boolean() });

export async function setNotifyEmailAction(
  input: z.infer<typeof SetNotifyEmail>,
) {
  const user = await requireUser();
  await setNotifyEmail(user.id, SetNotifyEmail.parse(input).enabled);
}
