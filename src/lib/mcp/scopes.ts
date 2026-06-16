import { errorPayload, type McpErrorPayload } from "@/lib/mcp/errors";
import type { TokenScope } from "@/lib/token-scopes";

/**
 * Every MCP tool declares its class when wrapping its handler in safe():
 * "read" for queries, "write" for task/contact/sidecar mutations, "admin"
 * for the structural surface (board conversion; webhooks/automations later).
 * The class names the scope the token must carry — exact match, no hierarchy.
 */
export type ToolClass = TokenScope;

/**
 * Returns the structured FORBIDDEN envelope when the token's scopes don't
 * cover the tool's class, or null when the call may proceed.
 */
export function scopeViolation(
  scopes: readonly string[] | undefined,
  required: ToolClass,
): McpErrorPayload | null {
  if (scopes?.includes(required)) return null;
  return errorPayload(
    "FORBIDDEN",
    `This token lacks the "${required}" scope required by this tool (token scopes: ${
      scopes && scopes.length > 0 ? scopes.join(", ") : "none"
    })`,
    `Use a token that has the "${required}" scope — create one under Account → API tokens.`,
  );
}
