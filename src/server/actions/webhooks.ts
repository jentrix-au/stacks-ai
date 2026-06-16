"use server";

import { z } from "zod";

import { requireUser } from "@/lib/session";
import * as webhookOps from "@/server/webhooks/operations";
import {
  CreateWebhookSchema,
  DeleteWebhookSchema,
  ListWebhookDeliveriesSchema,
  ListWebhooksSchema,
} from "@/server/webhooks/schemas";

export async function createWebhook(
  input: z.infer<typeof CreateWebhookSchema>,
) {
  const user = await requireUser();
  return webhookOps.createWebhook(user.id, CreateWebhookSchema.parse(input));
}

export async function listWebhooks(input: z.infer<typeof ListWebhooksSchema>) {
  const user = await requireUser();
  return webhookOps.listWebhooks(user.id, ListWebhooksSchema.parse(input));
}

export async function deleteWebhook(
  input: z.infer<typeof DeleteWebhookSchema>,
) {
  const user = await requireUser();
  await webhookOps.deleteWebhook(user.id, DeleteWebhookSchema.parse(input));
}

export async function listWebhookDeliveries(
  input: z.infer<typeof ListWebhookDeliveriesSchema>,
) {
  const user = await requireUser();
  return webhookOps.listWebhookDeliveries(
    user.id,
    ListWebhookDeliveriesSchema.parse(input),
  );
}
