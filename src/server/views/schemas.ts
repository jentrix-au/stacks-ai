import { z } from "zod";
import { Priority } from "@prisma/client";

/**
 * The persisted board-filter snapshot (P3.4). Mirrors the nuqs state in
 * src/components/board/board-filters.tsx — keep the two in sync.
 */
export const ViewFiltersSchema = z.object({
  labels: z.array(z.string().min(1)).max(50).default([]),
  assignees: z.array(z.string().min(1)).max(50).default([]),
  priorities: z.array(z.enum(Priority)).max(4).default([]),
  due: z.enum(["overdue", "today", "week"]).nullable().default(null),
  sort: z.enum(["priority", "due", "newest"]).nullable().default(null),
});
export type ViewFilters = z.infer<typeof ViewFiltersSchema>;

export const CreateSavedViewSchema = z.object({
  boardId: z.string().min(1),
  name: z.string().min(1).max(60),
  filters: ViewFiltersSchema,
  shared: z.boolean().default(false),
});
export type CreateSavedViewInput = z.infer<typeof CreateSavedViewSchema>;

export const DeleteSavedViewSchema = z.object({
  viewId: z.string().min(1),
});
export type DeleteSavedViewInput = z.infer<typeof DeleteSavedViewSchema>;
