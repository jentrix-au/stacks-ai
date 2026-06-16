import { z } from "zod";

export const CreateCommentSchema = z.object({
  taskId: z.string().min(1).describe("Task to comment on."),
  body: z
    .string()
    .min(1)
    .max(20_000)
    .describe("Comment body (markdown, max 20k chars)."),
  mentions: z
    .array(z.string().min(1))
    .max(50)
    .optional()
    .describe(
      "User ids to @mention — they get notified. Must be members of the task's workspace (discover via list_members).",
    ),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const UpdateCommentSchema = z.object({
  commentId: z.string().min(1).describe("Comment to edit."),
  body: z
    .string()
    .min(1)
    .max(20_000)
    .describe("New comment body (markdown, max 20k chars)."),
});
export type UpdateCommentInput = z.infer<typeof UpdateCommentSchema>;

export const DeleteCommentSchema = z.object({
  commentId: z.string().min(1).describe("Comment to delete."),
});
export type DeleteCommentInput = z.infer<typeof DeleteCommentSchema>;

export const ListCommentsSchema = z.object({
  taskId: z.string().min(1).describe("Task whose comments to list."),
});
export type ListCommentsInput = z.infer<typeof ListCommentsSchema>;
