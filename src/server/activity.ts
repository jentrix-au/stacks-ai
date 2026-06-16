import { Prisma } from "@prisma/client";

import { mcpActor } from "@/lib/authz-context";

// "automation" (P3.7) is a TS-union value only — never a DB enum. Ops called
// by the automation executor thread it through so automation-sourced events
// can NEVER re-trigger rules (the engine's hard loop guard) and the UI can
// badge automated changes.
export type ActivitySource = "ui" | "mcp" | "automation";

/**
 * Activity payload envelope: every activity carries `source`, and MCP-
 * sourced ones additionally carry `tokenId`/`tokenName` (P2.8) read from
 * the per-request context — the UI renders these as a "via 🤖 <token>"
 * badge and the tokens page lists a token's recent actions by tokenId.
 * Tokens with an agent identity (P4.1) also carry `tokenDisplayName` /
 * `tokenEmoji`, a write-time snapshot so badges survive token deletion.
 */
export function withSource(
  payload: Record<string, unknown>,
  source: ActivitySource,
): Prisma.InputJsonValue {
  const actor = source === "mcp" ? mcpActor() : null;
  return {
    ...payload,
    source,
    ...(actor ? { tokenId: actor.tokenId, tokenName: actor.tokenName } : {}),
    ...(actor?.displayName ? { tokenDisplayName: actor.displayName } : {}),
    ...(actor?.emoji ? { tokenEmoji: actor.emoji } : {}),
  } as Prisma.InputJsonValue;
}
