import { z } from "zod";

export const CreateColumnSchema = z.object({
  boardId: z.string().min(1).describe("Board to add the column to."),
  name: z.string().min(1).max(60).describe("Column name (max 60 chars)."),
});
export type CreateColumnInput = z.infer<typeof CreateColumnSchema>;

export const RenameColumnSchema = z.object({
  columnId: z.string().min(1).describe("Column to rename."),
  name: z.string().min(1).max(60).describe("New name."),
});
export type RenameColumnInput = z.infer<typeof RenameColumnSchema>;

export const MoveColumnSchema = z.object({
  columnId: z.string().min(1).describe("Column to move."),
  beforeColumnId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Sibling column the moved column lands AFTER."),
  afterColumnId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Sibling column the moved column lands BEFORE."),
});
export type MoveColumnInput = z.infer<typeof MoveColumnSchema>;

export const ArchiveColumnSchema = z.object({
  columnId: z.string().min(1).describe("Column to archive (soft delete)."),
});
export type ArchiveColumnInput = z.infer<typeof ArchiveColumnSchema>;

/**
 * Consolidated MCP input (manage_columns): one tool, `action` picks the
 * operation. Validated per action with superRefine; dispatches to the same
 * per-op schemas/ops the UI actions use.
 */
export const ManageColumnsSchema = z
  .object({
    action: z
      .enum(["create", "rename", "move", "archive"])
      .describe("Which column operation to perform."),
    boardId: z
      .string()
      .min(1)
      .optional()
      .describe("Required for action=create."),
    columnId: z
      .string()
      .min(1)
      .optional()
      .describe("Required for rename/move/archive."),
    name: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe("Column name — required for create and rename."),
    beforeColumnId: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe("For action=move: sibling the column lands AFTER."),
    afterColumnId: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe("For action=move: sibling the column lands BEFORE."),
  })
  .superRefine((v, ctx) => {
    if (v.action === "create") {
      if (!v.boardId)
        ctx.addIssue({ code: "custom", message: "boardId is required for action=create", path: ["boardId"] });
    } else if (!v.columnId) {
      ctx.addIssue({ code: "custom", message: `columnId is required for action=${v.action}`, path: ["columnId"] });
    }
    if ((v.action === "create" || v.action === "rename") && !v.name) {
      ctx.addIssue({ code: "custom", message: `name is required for action=${v.action}`, path: ["name"] });
    }
  });
export type ManageColumnsInput = z.infer<typeof ManageColumnsSchema>;
