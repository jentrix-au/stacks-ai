"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { pusherClient, boardChannel } from "@/lib/pusher-client";

/**
 * Subscribes the current client to a board's real-time channel.
 *
 * `onEvent` (P3.9) gets first crack at every board event — returning true
 * means it patched local state in place and no refresh is needed. Anything
 * unhandled falls back to router.refresh() to revalidate the server tree.
 * The handler rides in a ref so the subscription survives re-renders.
 */
export function useBoardRealtime(
  boardId: string,
  onEvent?: (event: string, payload: unknown) => boolean,
) {
  const router = useRouter();
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    const client = pusherClient();
    if (!client) return;
    const channel = client.subscribe(boardChannel(boardId));
    const onAny = (event: string, payload: unknown) => {
      // Pusher-internal frames (subscription lifecycle) aren't board events.
      if (event.startsWith("pusher:")) return;
      if (handlerRef.current?.(event, payload)) return;
      router.refresh();
    };
    channel.bind_global(onAny);
    return () => {
      channel.unbind_global(onAny);
      client.unsubscribe(boardChannel(boardId));
    };
  }, [boardId, router]);
}
