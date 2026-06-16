import { after } from "next/server";

import { db } from "@/lib/db";
import { triggerBoardEvent, type BoardEvent } from "@/lib/pusher-server";
import { processDelivery } from "@/lib/webhooks/deliver";

/**
 * The ops-core event fan-out (P2.6): Pusher realtime + outbound webhook
 * enqueue in one call. Every mutation that previously called
 * triggerBoardEvent now calls this. Webhook failures never break the
 * mutation — deliveries persist and the cron retries them.
 */
export async function emitBoardEvent(
  boardId: string,
  event: BoardEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  await triggerBoardEvent(boardId, event, payload);
  try {
    const deliveryIds = await enqueueWebhookDeliveries(boardId, event, payload);
    if (deliveryIds.length > 0) {
      // First attempt happens post-response; retries via cron.
      scheduleAfterResponse(async () => {
        for (const id of deliveryIds) {
          await processDelivery(id);
        }
      });
    }
  } catch (e) {
    console.error("webhook enqueue failed", e);
  }
}

export function scheduleAfterResponse(fn: () => Promise<void>): void {
  try {
    after(fn);
  } catch {
    // Outside a Next request scope (tests, scripts): run inline, detached.
    void fn().catch((e) => console.error("webhook delivery failed", e));
  }
}

/**
 * Persist one PENDING delivery per matching active webhook of the board's
 * workspace. An empty `events` filter means "all events".
 */
export async function enqueueWebhookDeliveries(
  boardId: string,
  event: BoardEvent,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { workspaceId: true },
  });
  if (!board) return [];
  const webhooks = await db.webhook.findMany({
    where: {
      workspaceId: board.workspaceId,
      active: true,
      OR: [{ events: { isEmpty: true } }, { events: { has: event } }],
    },
    select: { id: true },
  });
  if (webhooks.length === 0) return [];

  const data = {
    event,
    payload: {
      boardId,
      workspaceId: board.workspaceId,
      ...payload,
    },
    nextRetryAt: new Date(),
  };
  const created = await db.$transaction(
    webhooks.map((w) =>
      db.webhookDelivery.create({
        data: { webhookId: w.id, ...data },
        select: { id: true },
      }),
    ),
  );
  return created.map((d) => d.id);
}
