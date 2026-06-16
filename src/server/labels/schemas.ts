import { z } from "zod";

const LabelColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .describe("Hex color like #ef4444.");

export const CreateLabelSchema = z.object({
  boardId: z.string().min(1).describe("Board to create the label on."),
  name: z.string().min(1).max(40).describe("Label name (max 40 chars)."),
  color: LabelColor,
});
export type CreateLabelInput = z.infer<typeof CreateLabelSchema>;

export const UpdateLabelSchema = z.object({
  labelId: z.string().min(1).describe("Label to update."),
  name: z.string().min(1).max(40).optional().describe("New name."),
  color: LabelColor.optional().describe("New color."),
});
export type UpdateLabelInput = z.infer<typeof UpdateLabelSchema>;

export const DeleteLabelSchema = z.object({
  labelId: z.string().min(1).describe("Label to delete."),
});
export type DeleteLabelInput = z.infer<typeof DeleteLabelSchema>;

/**
 * Consolidated MCP input (manage_labels): one tool, `action` picks the
 * operation. Validated per action with superRefine; the handler dispatches
 * to the same per-op schemas/ops the UI actions use.
 */
export const ManageLabelsSchema = z
  .object({
    action: z
      .enum(["create", "update", "delete"])
      .describe("Which label operation to perform."),
    boardId: z
      .string()
      .min(1)
      .optional()
      .describe("Required for action=create."),
    labelId: z
      .string()
      .min(1)
      .optional()
      .describe("Required for action=update and action=delete."),
    name: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe("Label name — required for create, optional for update."),
    color: LabelColor.optional().describe(
      "Hex color — required for create, optional for update.",
    ),
  })
  .superRefine((v, ctx) => {
    if (v.action === "create") {
      if (!v.boardId)
        ctx.addIssue({ code: "custom", message: "boardId is required for action=create", path: ["boardId"] });
      if (!v.name)
        ctx.addIssue({ code: "custom", message: "name is required for action=create", path: ["name"] });
      if (!v.color)
        ctx.addIssue({ code: "custom", message: "color is required for action=create", path: ["color"] });
    } else if (!v.labelId) {
      ctx.addIssue({ code: "custom", message: `labelId is required for action=${v.action}`, path: ["labelId"] });
    }
    if (v.action === "update" && v.name === undefined && v.color === undefined) {
      ctx.addIssue({ code: "custom", message: "Provide name and/or color for action=update", path: ["name"] });
    }
  });
export type ManageLabelsInput = z.infer<typeof ManageLabelsSchema>;
