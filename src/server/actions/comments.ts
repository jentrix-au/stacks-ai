"use server";

import { z } from "zod";

import { db } from "@/lib/db";
import { agentIdentityOf } from "@/lib/activity-source";
import { requireUser } from "@/lib/session";
import { requireTaskAccess } from "@/lib/authz";
import * as commentOps from "@/server/comments/operations";
import {
  CreateCommentSchema,
  DeleteCommentSchema,
  UpdateCommentSchema,
} from "@/server/comments/schemas";

export async function createComment(
  input: z.infer<typeof CreateCommentSchema>,
) {
  const user = await requireUser();
  return commentOps.createComment(
    user.id,
    CreateCommentSchema.parse(input),
    "ui",
  );
}

const EditComment = UpdateCommentSchema;

export async function editComment(input: z.infer<typeof EditComment>) {
  const user = await requireUser();
  await commentOps.updateComment(user.id, EditComment.parse(input), "ui");
}

export async function deleteComment(
  input: z.infer<typeof DeleteCommentSchema>,
) {
  const user = await requireUser();
  await commentOps.deleteComment(
    user.id,
    DeleteCommentSchema.parse(input),
    "ui",
  );
}

/** UI-shaped read (Date objects + author image) used by the detail panel. */
export async function listComments(taskId: string) {
  const user = await requireUser();
  await requireTaskAccess(user.id, taskId);
  const [comments, createdActivities] = await Promise.all([
    db.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, name: true, email: true, image: true } },
      },
    }),
    // COMMENT_CREATED payloads carry commentId + (for MCP) the agent
    // identity — join them so agent comments render an attribution badge
    // (P2.8; P4.1 adds displayName/emoji).
    db.activity.findMany({
      where: { taskId, type: "COMMENT_CREATED" },
      select: { payload: true },
    }),
  ]);
  const viaByCommentId = new Map<
    string,
    { name: string; emoji: string | null }
  >();
  for (const a of createdActivities) {
    const commentId = (a.payload as { commentId?: string } | null)?.commentId;
    const agent = agentIdentityOf(a.payload);
    if (commentId && agent) viaByCommentId.set(commentId, agent);
  }
  return comments.map((c) => ({
    ...c,
    viaAgent: viaByCommentId.get(c.id) ?? null,
  }));
}
