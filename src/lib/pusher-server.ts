import Pusher from "pusher";

let _pusher: Pusher | null = null;

function pusherClient(): Pusher | null {
  if (_pusher) return _pusher;
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } =
    process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    return null;
  }
  _pusher = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });
  return _pusher;
}

export function boardChannel(boardId: string) {
  return `private-board-${boardId}`;
}

// Runtime list so webhooks can validate event filters (P2.6); the type is
// derived from it and stays identical to the old union.
export const BOARD_EVENTS = [
  "task.created",
  "task.updated",
  "task.moved",
  "task.archived",
  "column.created",
  "column.updated",
  "column.moved",
  "column.archived",
  "board.renamed",
  "board.kind_changed",
  "label.created",
  "label.updated",
  "label.deleted",
  "comment.created",
  "comment.updated",
  "comment.deleted",
  "attachment.created",
  "attachment.removed",
  "deal.updated",
  "bug.updated",
  "ticket.updated",
  "initiative.updated",
  // P3.6 cron sweep events (system-generated, no actor).
  "task.due_soon",
  "ticket.sla_breached",
  // P3.7: emitted by the automation "fire_webhook" action.
  "automation.fired",
] as const;

export type BoardEvent = (typeof BOARD_EVENTS)[number];

/**
 * Trigger a real-time event for a board. Silently noops if Pusher is not
 * configured (so dev works without credentials).
 */
export async function triggerBoardEvent(
  boardId: string,
  event: BoardEvent,
  payload: Record<string, unknown>,
) {
  const client = pusherClient();
  if (!client) return;
  try {
    await client.trigger(boardChannel(boardId), event, payload);
  } catch (err) {
    console.error("[pusher] trigger failed", err);
  }
}

export function authorizeBoardChannel(
  socketId: string,
  channel: string,
  user: { id: string; name?: string | null; image?: string | null },
) {
  const client = pusherClient();
  if (!client) return null;
  if (channel.startsWith("presence-")) {
    return client.authorizeChannel(socketId, channel, {
      user_id: user.id,
      user_info: { name: user.name ?? null, image: user.image ?? null },
    });
  }
  return client.authorizeChannel(socketId, channel);
}
