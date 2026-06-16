import { z } from "zod";

export const CreateSubtaskSchema = z.object({
  taskId: z.string().min(1).describe("Parent task."),
  title: z.string().min(1).max(200).describe("Subtask title (max 200 chars)."),
});
export type CreateSubtaskInput = z.infer<typeof CreateSubtaskSchema>;

export const ToggleSubtaskSchema = z.object({
  subtaskId: z.string().min(1).describe("Subtask to toggle."),
  completed: z.boolean().describe("New completion state."),
});
export type ToggleSubtaskInput = z.infer<typeof ToggleSubtaskSchema>;

export const RenameSubtaskSchema = z.object({
  subtaskId: z.string().min(1).describe("Subtask to rename."),
  title: z.string().min(1).max(200).describe("New title."),
});
export type RenameSubtaskInput = z.infer<typeof RenameSubtaskSchema>;

export const DeleteSubtaskSchema = z.object({
  subtaskId: z.string().min(1).describe("Subtask to delete."),
});
export type DeleteSubtaskInput = z.infer<typeof DeleteSubtaskSchema>;

export const ReorderSubtaskSchema = z.object({
  subtaskId: z.string().min(1),
  beforeId: z.string().min(1).nullable().optional(),
  afterId: z.string().min(1).nullable().optional(),
});
export type ReorderSubtaskInput = z.infer<typeof ReorderSubtaskSchema>;
