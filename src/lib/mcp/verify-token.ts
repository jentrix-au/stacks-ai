import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { TokenError, verifyToken } from "@/lib/api-tokens";

export async function verifyBearerToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  try {
    const {
      tokenId,
      tokenName,
      displayName,
      emoji,
      userId,
      scopes,
      workspaceId,
      rateLimit,
    } = await verifyToken(bearerToken);
    return {
      token: bearerToken,
      clientId: userId,
      // Effective scopes ("read" / "write" / "admin"; grandfathered tokens
      // get all three). Enforced per tool class by safe() in tools.ts.
      scopes,
      // `rateLimit` (when set) makes every tool call in this request return
      // a structured RATE_LIMITED error — withMcpAuth can only emit 401s,
      // which would read as a dead token to the agent.
      // `allowedWorkspaceId` (when set) restricts every authz check in the
      // request to that workspace; tokenId/tokenName flow into activity
      // attribution (src/lib/authz-context.ts).
      extra: {
        userId,
        tokenId,
        tokenName,
        // Agent identity (P4.1) — flows into activity attribution badges.
        ...(displayName ? { tokenDisplayName: displayName } : {}),
        ...(emoji ? { tokenEmoji: emoji } : {}),
        ...(workspaceId ? { allowedWorkspaceId: workspaceId } : {}),
        ...(rateLimit ? { rateLimit } : {}),
      },
    };
  } catch (err) {
    if (err instanceof TokenError) {
      return undefined;
    }
    throw err;
  }
}
