"use client";

import PusherJS from "pusher-js";

let _pusher: PusherJS | null = null;

export function pusherClient(): PusherJS | null {
  if (_pusher) return _pusher;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) return null;
  _pusher = new PusherJS(key, {
    cluster,
    authEndpoint: "/api/pusher/auth",
    forceTLS: true,
  });
  return _pusher;
}

export function boardChannel(boardId: string) {
  return `private-board-${boardId}`;
}
