import { WebhookDeliveryStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { assertSafeWebhookUrl, signWebhookBody } from "./security";

export const MAX_ATTEMPTS = 8;
export const DELIVERY_TIMEOUT_MS = 5_000;
/** Exhausted deliveries in a row before the webhook auto-disables. */
export const AUTO_DISABLE_AFTER_FAILURES = 3;

/** Exponential backoff: 1m, 2m, 4m, … capped at 2h. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** (attempts - 1) * 60_000, 2 * 60 * 60 * 1000);
}

export interface DeliveryAttemptOutcome {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * One HTTP attempt: SSRF-check, sign, POST. No DB access — state
 * transitions live in processDelivery so this can be tested against a
 * local receiver directly.
 */
export async function attemptDelivery(
  webhook: { url: string; secret: string },
  delivery: { id: string; event: string; payload: unknown; createdAt: Date },
): Promise<DeliveryAttemptOutcome> {
  try {
    await assertSafeWebhookUrl(webhook.url);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bad URL" };
  }

  const body = JSON.stringify({
    id: delivery.id,
    event: delivery.event,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.payload,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signWebhookBody(webhook.secret, timestamp, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stacks-Signature": signature,
        "X-Stacks-Timestamp": timestamp,
        "X-Stacks-Event": delivery.event,
        "X-Stacks-Delivery-Id": delivery.id,
      },
      body,
      redirect: "manual", // SSRF: never follow redirects
      signal: controller.signal,
    });
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempt one PENDING delivery and persist the state transition: SUCCESS,
 * PENDING with backoff, or FAILED after MAX_ATTEMPTS (which counts toward
 * the webhook's auto-disable threshold).
 */
export async function processDelivery(deliveryId: string): Promise<void> {
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (!delivery || delivery.status !== WebhookDeliveryStatus.PENDING) return;
  if (!delivery.webhook.active) {
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        nextRetryAt: null,
        lastError: "Webhook disabled",
      },
    });
    return;
  }

  const outcome = await attemptDelivery(delivery.webhook, delivery);
  const attempts = delivery.attempts + 1;

  if (outcome.ok) {
    await db.$transaction([
      db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.SUCCESS,
          attempts,
          nextRetryAt: null,
          lastError: null,
          deliveredAt: new Date(),
        },
      }),
      db.webhook.update({
        where: { id: delivery.webhookId },
        data: { consecutiveFailures: 0 },
      }),
    ]);
    return;
  }

  if (attempts < MAX_ATTEMPTS) {
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts,
        lastError: outcome.error ?? "Delivery failed",
        nextRetryAt: new Date(Date.now() + backoffMs(attempts)),
      },
    });
    return;
  }

  // Exhausted: mark FAILED and count toward auto-disable.
  const failures = delivery.webhook.consecutiveFailures + 1;
  await db.$transaction([
    db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        attempts,
        nextRetryAt: null,
        lastError: outcome.error ?? "Delivery failed",
      },
    }),
    db.webhook.update({
      where: { id: delivery.webhookId },
      data: {
        consecutiveFailures: failures,
        ...(failures >= AUTO_DISABLE_AFTER_FAILURES ? { active: false } : {}),
      },
    }),
  ]);
}

/** Drain deliveries whose retry time has come (cron entry point). */
export async function drainDueDeliveries(limit = 50): Promise<number> {
  const due = await db.webhookDelivery.findMany({
    where: {
      status: WebhookDeliveryStatus.PENDING,
      nextRetryAt: { lte: new Date() },
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const d of due) {
    await processDelivery(d.id);
  }
  return due.length;
}
