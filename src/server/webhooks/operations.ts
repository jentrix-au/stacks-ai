import { randomBytes } from "node:crypto";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { AuthzError, requireWorkspaceRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { assertSafeWebhookUrl } from "@/lib/webhooks/security";

import type {
  CreateWebhookInput,
  DeleteWebhookInput,
  ListWebhookDeliveriesInput,
  ListWebhooksInput,
} from "./schemas";

// Webhook management ops (P2.6). ADMIN-only — webhooks exfiltrate workspace
// data to external URLs, so this is part of the structural surface
// (admin-scoped MCP tools).

async function revalidateSettings(workspaceId: string) {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });
  if (ws) revalidatePath(`/${ws.slug}/settings`);
}

async function requireWebhookAccess(userId: string, webhookId: string) {
  const webhook = await db.webhook.findUnique({
    where: { id: webhookId },
    select: { id: true, workspaceId: true },
  });
  if (!webhook) throw new AuthzError("Webhook not found", 404);
  await requireWorkspaceRole(userId, webhook.workspaceId, Role.ADMIN);
  return webhook;
}

/** Returns the signing secret ONCE — it is never readable again. */
export async function createWebhook(userId: string, input: CreateWebhookInput) {
  await requireWorkspaceRole(userId, input.workspaceId, Role.ADMIN);
  await assertSafeWebhookUrl(input.url);

  const secret = `whsec_${randomBytes(32).toString("hex")}`;
  const webhook = await db.webhook.create({
    data: {
      workspaceId: input.workspaceId,
      url: input.url,
      secret,
      events: input.events ?? [],
      createdById: userId,
    },
    select: { id: true, url: true, events: true, active: true },
  });
  await revalidateSettings(input.workspaceId);
  return { ...webhook, secret };
}

export async function listWebhooks(userId: string, input: ListWebhooksInput) {
  await requireWorkspaceRole(userId, input.workspaceId, Role.ADMIN);
  const webhooks = await db.webhook.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      url: true,
      events: true,
      active: true,
      consecutiveFailures: true,
      createdAt: true,
    },
  });
  return {
    webhooks: webhooks.map((w) => ({
      ...w,
      createdAt: w.createdAt.toISOString(),
    })),
  };
}

export async function deleteWebhook(
  userId: string,
  input: DeleteWebhookInput,
): Promise<void> {
  const webhook = await requireWebhookAccess(userId, input.webhookId);
  await db.webhook.delete({ where: { id: webhook.id } });
  await revalidateSettings(webhook.workspaceId);
}

export async function listWebhookDeliveries(
  userId: string,
  input: ListWebhookDeliveriesInput,
) {
  await requireWebhookAccess(userId, input.webhookId);
  const take = Math.min(Math.max(input.take ?? 25, 1), 100);
  const rows = await db.webhookDelivery.findMany({
    where: { webhookId: input.webhookId },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      event: true,
      status: true,
      attempts: true,
      nextRetryAt: true,
      lastError: true,
      deliveredAt: true,
      createdAt: true,
    },
  });
  const hasMore = rows.length > take;
  const trimmed = hasMore ? rows.slice(0, take) : rows;
  return {
    deliveries: trimmed.map((d) => ({
      ...d,
      nextRetryAt: d.nextRetryAt ? d.nextRetryAt.toISOString() : null,
      deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
      createdAt: d.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
  };
}
