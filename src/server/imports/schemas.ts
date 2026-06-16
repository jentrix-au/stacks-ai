import { z } from "zod";
import { Priority } from "@prisma/client";

/** CSV/Trello import shapes (P3.8). Rows arrive pre-mapped by the UI. */

export const ContactImportRowSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  externalId: z.string().max(200).nullable().optional(),
});
export type ContactImportRow = z.infer<typeof ContactImportRowSchema>;

export const ImportContactsSchema = z.object({
  workspaceId: z.string().min(1),
  rows: z.array(ContactImportRowSchema).min(1).max(5000),
});
export type ImportContactsInput = z.infer<typeof ImportContactsSchema>;

export const TaskImportRowSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(50_000).nullable().optional(),
  priority: z.enum(Priority).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export type TaskImportRow = z.infer<typeof TaskImportRowSchema>;

export const ImportTasksSchema = z.object({
  columnId: z.string().min(1),
  rows: z.array(TaskImportRowSchema).min(1).max(5000),
  // Idempotency knob: skip rows whose title already exists on the board.
  skipExistingTitles: z.boolean().default(true),
});
export type ImportTasksInput = z.infer<typeof ImportTasksSchema>;

export const TrelloImportSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(120),
  lists: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        cards: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              desc: z.string().max(50_000).optional(),
              due: z.string().datetime({ offset: true }).nullable().optional(),
            }),
          )
          .max(1000),
      }),
    )
    .min(1)
    .max(50),
});
export type TrelloImportInput = z.infer<typeof TrelloImportSchema>;
