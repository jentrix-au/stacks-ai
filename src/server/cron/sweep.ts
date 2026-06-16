import { ActivityType, Prisma, TicketSeverity } from "@prisma/client";

import { db } from "@/lib/db";
import {
  EMBED_BATCH_SIZE,
  embedTexts,
  embeddingsEnabled,
  vectorLiteral,
} from "@/lib/embeddings";
import { emitBoardEvent } from "@/lib/events";
import { drainDueDeliveries } from "@/lib/webhooks/deliver";
import { dispatchAutomationEvent } from "@/server/automations/engine";
import {
  createTaskNotifications,
  getTaskNotifyContext,
} from "@/server/notifications";

/**
 * P3.6 time-based engine: one cron sweep (every 5 min, see vercel.json)
 * covering due-soon/overdue reminders, SLA breaches, the idempotency-key TTL
 * sweep, the webhook retry drain (shared with P2.6 — the sweep replaces the
 * separate webhooks-retry cron entry; that route stays for manual runs), and
 * the P4.3 embedding refresh.
 *
 * The clock is injected everywhere ("now") and the selection rules are pure
 * functions, so the once-only semantics are unit-testable.
 */

export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SweepSummary {
  dueSoonNotified: number;
  slaBreached: number;
  idempotencyKeysDeleted: number;
  webhooksDrained: number;
  embeddingsWritten: number;
}

export interface DueSoonSelection {
  taskId: string;
  dueAt: Date;
  overdue: boolean;
  /** Dedup key persisted in the notification payload. */
  marker: string;
}

export function dueSoonMarker(
  taskId: string,
  dueAt: Date,
  overdue: boolean,
): string {
  return `${taskId}:${dueAt.toISOString()}:${overdue ? "overdue" : "due_soon"}`;
}

/**
 * Tasks due within the window (or already overdue) that have NOT yet been
 * reminded for this (dueAt, phase). Each due date produces at most two
 * reminders: one entering the 24h window, one once overdue. Changing the due
 * date re-arms both.
 */
export function selectDueSoon(
  tasks: { id: string; dueAt: Date | null }[],
  alreadySentMarkers: Set<string>,
  now: Date,
): DueSoonSelection[] {
  const horizon = now.getTime() + DUE_SOON_WINDOW_MS;
  const out: DueSoonSelection[] = [];
  for (const t of tasks) {
    if (!t.dueAt || t.dueAt.getTime() > horizon) continue;
    const overdue = t.dueAt.getTime() < now.getTime();
    const marker = dueSoonMarker(t.id, t.dueAt, overdue);
    if (alreadySentMarkers.has(marker)) continue;
    out.push({ taskId: t.id, dueAt: t.dueAt, overdue, marker });
  }
  return out;
}

/**
 * Unresolved tickets past their SLA that have never breached before —
 * "before" = an SLA_BREACHED activity already exists for the task, which is
 * written in the same transaction as the notifications, so a breach fires
 * exactly once per ticket.
 */
export function selectSlaBreaches(
  tickets: {
    taskId: string;
    slaDueAt: Date | null;
    resolvedAt: Date | null;
    severity: TicketSeverity | null;
  }[],
  alreadyBreachedTaskIds: Set<string>,
  now: Date,
): { taskId: string; slaDueAt: Date }[] {
  return tickets
    .filter(
      (t) =>
        t.resolvedAt === null &&
        t.slaDueAt !== null &&
        t.slaDueAt.getTime() <= now.getTime() &&
        !alreadyBreachedTaskIds.has(t.taskId),
    )
    .map((t) => ({ taskId: t.taskId, slaDueAt: t.slaDueAt! }));
}

const OPEN_TASK = {
  archivedAt: null as null,
  column: { archivedAt: null, board: { archivedAt: null } },
};

/** Watchers ∪ assignees for one task — the reminder audience. */
async function taskAudience(taskId: string): Promise<string[]> {
  const [watchers, assignees] = await Promise.all([
    db.taskWatcher.findMany({ where: { taskId }, select: { userId: true } }),
    db.taskAssignee.findMany({ where: { taskId }, select: { userId: true } }),
  ]);
  return [...new Set([...watchers, ...assignees].map((row) => row.userId))];
}

async function sweepDueSoon(now: Date): Promise<number> {
  const horizon = new Date(now.getTime() + DUE_SOON_WINDOW_MS);
  const candidates = await db.task.findMany({
    where: { ...OPEN_TASK, dueAt: { not: null, lte: horizon } },
    select: { id: true, dueAt: true },
  });
  if (candidates.length === 0) return 0;

  const prior = await db.notification.findMany({
    where: {
      type: "due_soon",
      taskId: { in: candidates.map((t) => t.id) },
    },
    select: { payload: true },
  });
  const sent = new Set(
    prior
      .map((n) => (n.payload as { marker?: string } | null)?.marker)
      .filter((m): m is string => typeof m === "string"),
  );

  const selected = selectDueSoon(candidates, sent, now);
  let notified = 0;
  for (const item of selected) {
    const [ctx, audience] = await Promise.all([
      getTaskNotifyContext(db, item.taskId, ""),
      taskAudience(item.taskId),
    ]);
    if (!ctx) continue;
    const payload = {
      actorName: null,
      taskKey: ctx.taskKey,
      taskTitle: ctx.taskTitle,
      boardSlug: ctx.boardSlug,
      preview: item.overdue
        ? `Overdue since ${item.dueAt.toISOString().slice(0, 10)}`
        : `Due ${item.dueAt.toISOString().slice(0, 10)}`,
      marker: item.marker,
      dueAt: item.dueAt.toISOString(),
      overdue: item.overdue,
    };
    if (audience.length > 0) {
      await db.notification.createMany({
        data: audience.map((userId) => ({
          userId,
          workspaceId: ctx.workspaceId,
          taskId: item.taskId,
          type: "due_soon",
          payload,
        })),
      });
    } else {
      // Marker tombstone for audience-less tasks (pre-read row addressed to
      // the creator) so they don't get rescanned every 5 minutes.
      const creator = await db.task.findUnique({
        where: { id: item.taskId },
        select: { createdById: true },
      });
      if (creator) {
        await db.notification.create({
          data: {
            userId: creator.createdById,
            workspaceId: ctx.workspaceId,
            taskId: item.taskId,
            type: "due_soon",
            payload,
            readAt: now,
          },
        });
      }
    }
    await emitBoardEvent(ctx.boardId, "task.due_soon", {
      taskId: item.taskId,
      taskKey: ctx.taskKey,
      dueAt: item.dueAt.toISOString(),
      overdue: item.overdue,
    });
    if (item.overdue) {
      await dispatchAutomationEvent({
        kind: "due.passed",
        taskId: item.taskId,
        boardId: ctx.boardId,
        workspaceId: ctx.workspaceId,
        source: "system",
      });
    }
    notified += 1;
  }
  return notified;
}

async function sweepSlaBreaches(now: Date): Promise<number> {
  const tickets = await db.ticket.findMany({
    where: {
      resolvedAt: null,
      slaDueAt: { not: null, lte: now },
      task: OPEN_TASK,
    },
    select: {
      taskId: true,
      slaDueAt: true,
      resolvedAt: true,
      severity: true,
    },
  });
  if (tickets.length === 0) return 0;

  const prior = await db.activity.findMany({
    where: {
      type: ActivityType.SLA_BREACHED,
      taskId: { in: tickets.map((t) => t.taskId) },
    },
    select: { taskId: true },
  });
  const breached = new Set(prior.map((a) => a.taskId));

  const selected = selectSlaBreaches(tickets, breached, now);
  let count = 0;
  for (const item of selected) {
    const [ctx, audience] = await Promise.all([
      getTaskNotifyContext(db, item.taskId, ""),
      taskAudience(item.taskId),
    ]);
    if (!ctx) continue;
    await db.$transaction(async (tx) => {
      // The activity row IS the once-only marker (same transaction).
      await tx.activity.create({
        data: {
          taskId: item.taskId,
          actorId: null,
          type: ActivityType.SLA_BREACHED,
          payload: {
            source: "system",
            slaDueAt: item.slaDueAt.toISOString(),
          },
        },
      });
      await createTaskNotifications(
        tx,
        ctx,
        "sla_breached",
        audience,
        `SLA was due ${item.slaDueAt.toISOString().slice(0, 16).replace("T", " ")}`,
      );
    });
    await emitBoardEvent(ctx.boardId, "ticket.sla_breached", {
      taskId: item.taskId,
      taskKey: ctx.taskKey,
      slaDueAt: item.slaDueAt.toISOString(),
    });
    await dispatchAutomationEvent({
      kind: "sla.breached",
      taskId: item.taskId,
      boardId: ctx.boardId,
      workspaceId: ctx.workspaceId,
      source: "system",
    });
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// P4.3 embedding refresh. The SQL computes both the text to embed and its
// md5 — TypeScript never re-derives the hash, so the staleness predicate
// and the stored value can't drift. Rows whose stored hash differs from the
// current text (new OR edited) are re-embedded, newest-edited first.
// ---------------------------------------------------------------------------

const TASK_EMBED_TEXT = Prisma.sql`left(t."title" || E'\n' || coalesce(t."description", ''), 8000)`;
const CONTACT_EMBED_TEXT = Prisma.sql`left(ct."name" || E'\n' || coalesce(ct."email", '') || E'\n' || coalesce(ct."company", ''), 8000)`;

interface EmbedRow {
  id: string;
  text: string;
  hash: string;
}

async function embedRows(
  rows: EmbedRow[],
  table: "Task" | "Contact",
): Promise<number> {
  if (rows.length === 0) return 0;
  const vectors = await embedTexts(
    rows.map((r) => r.text),
    "document",
  );
  for (let i = 0; i < rows.length; i++) {
    const tableSql =
      table === "Task" ? Prisma.sql`"Task"` : Prisma.sql`"Contact"`;
    await db.$executeRaw(Prisma.sql`
      UPDATE ${tableSql}
      SET "embedding" = ${vectorLiteral(vectors[i])}::vector,
          "embeddingHash" = ${rows[i].hash}
      WHERE "id" = ${rows[i].id}`);
  }
  return rows.length;
}

async function sweepEmbeddings(): Promise<number> {
  if (!embeddingsEnabled()) return 0;
  try {
    const staleTasks = await db.$queryRaw<EmbedRow[]>(Prisma.sql`
      SELECT t."id", ${TASK_EMBED_TEXT} AS "text", md5(${TASK_EMBED_TEXT}) AS "hash"
      FROM "Task" t
      JOIN "Column" c ON c."id" = t."columnId"
      JOIN "Board" b ON b."id" = c."boardId"
      WHERE t."archivedAt" IS NULL
        AND c."archivedAt" IS NULL
        AND b."archivedAt" IS NULL
        AND (t."embeddingHash" IS NULL OR t."embeddingHash" <> md5(${TASK_EMBED_TEXT}))
      ORDER BY t."updatedAt" DESC
      LIMIT ${EMBED_BATCH_SIZE}`);
    const staleContacts = await db.$queryRaw<EmbedRow[]>(Prisma.sql`
      SELECT ct."id", ${CONTACT_EMBED_TEXT} AS "text", md5(${CONTACT_EMBED_TEXT}) AS "hash"
      FROM "Contact" ct
      WHERE ct."archivedAt" IS NULL
        AND (ct."embeddingHash" IS NULL OR ct."embeddingHash" <> md5(${CONTACT_EMBED_TEXT}))
      ORDER BY ct."updatedAt" DESC
      LIMIT ${EMBED_BATCH_SIZE}`);
    return (
      (await embedRows(staleTasks, "Task")) +
      (await embedRows(staleContacts, "Contact"))
    );
  } catch (err) {
    // Embeddings are best-effort enrichment — a provider outage must never
    // fail reminders/SLA/webhook steps. Stale rows are retried next sweep.
    console.error("[sweep] embedding refresh failed:", err);
    return 0;
  }
}

export async function runSweep(now: Date = new Date()): Promise<SweepSummary> {
  const [
    dueSoonNotified,
    slaBreached,
    expired,
    webhooksDrained,
    embeddingsWritten,
  ] = await Promise.all([
    sweepDueSoon(now),
    sweepSlaBreaches(now),
    db.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } }),
    drainDueDeliveries(),
    sweepEmbeddings(),
  ]);
  return {
    dueSoonNotified,
    slaBreached,
    idempotencyKeysDeleted: expired.count,
    webhooksDrained,
    embeddingsWritten,
  };
}
