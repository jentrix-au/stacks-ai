import { z } from "zod";

import { BOARD_EVENTS } from "@/lib/pusher-server";

export const CreateWebhookSchema = z.object({
  workspaceId: z
    .string()
    .min(1)
    .describe("Workspace whose events to deliver."),
  url: z
    .string()
    .url()
    .max(2000)
    .describe(
      "HTTPS endpoint to POST events to. Private/internal addresses are rejected.",
    ),
  events: z
    .array(z.enum(BOARD_EVENTS))
    .optional()
    .describe(
      "Event names to deliver (e.g. task.created, comment.created). Omit or pass [] for ALL events.",
    ),
});
export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;

export const ListWebhooksSchema = z.object({
  workspaceId: z.string().min(1).describe("Workspace ID."),
});
export type ListWebhooksInput = z.infer<typeof ListWebhooksSchema>;

export const DeleteWebhookSchema = z.object({
  webhookId: z.string().min(1).describe("Webhook to delete."),
});
export type DeleteWebhookInput = z.infer<typeof DeleteWebhookSchema>;

export const ListWebhookDeliveriesSchema = z.object({
  webhookId: z.string().min(1).describe("Webhook whose deliveries to list."),
  take: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size (default 25, max 100)."),
  cursor: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Pagination cursor from a previous response's nextCursor."),
});
export type ListWebhookDeliveriesInput = z.infer<
  typeof ListWebhookDeliveriesSchema
>;
