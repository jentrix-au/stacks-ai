import { AsyncLocalStorage } from "node:async_hooks";

// Per-request MCP context (P2.1 workspace restriction + P2.8 attribution).
//
// The MCP layer runs every tool/resource handler inside
// `runWithMcpRequestContext`; `requireWorkspaceRole` — the choke point every
// authz helper funnels through — rejects workspaces other than
// `allowedWorkspaceId`, and activity writers read `tokenId`/`tokenName` to
// attribute agent actions. UI server actions never set this context, so
// session-based access is unaffected.

export interface McpRequestContext {
  allowedWorkspaceId?: string | null;
  tokenId?: string | null;
  tokenName?: string | null;
  /** Agent identity (P4.1) — teammate-facing name + emoji for badges. */
  tokenDisplayName?: string | null;
  tokenEmoji?: string | null;
}

const storage = new AsyncLocalStorage<McpRequestContext>();

export function runWithMcpRequestContext<T>(
  context: McpRequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

/** Back-compat wrapper used where only the restriction matters. */
export function runWithWorkspaceRestriction<T>(
  allowedWorkspaceId: string | null | undefined,
  fn: () => T,
): T {
  if (!allowedWorkspaceId) return fn();
  return storage.run({ allowedWorkspaceId }, fn);
}

/** The workspace the current request is restricted to, or null if unrestricted. */
export function restrictedWorkspaceId(): string | null {
  return storage.getStore()?.allowedWorkspaceId ?? null;
}

/** The API token behind the current MCP request, for activity attribution. */
export function mcpActor(): {
  tokenId: string;
  tokenName: string;
  displayName: string | null;
  emoji: string | null;
} | null {
  const store = storage.getStore();
  if (!store?.tokenId) return null;
  return {
    tokenId: store.tokenId,
    tokenName: store.tokenName ?? "API token",
    displayName: store.tokenDisplayName ?? null,
    emoji: store.tokenEmoji ?? null,
  };
}
