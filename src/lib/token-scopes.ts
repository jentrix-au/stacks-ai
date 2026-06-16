// API-token scopes (least privilege). Client-safe — no Prisma imports.
//
// "read"  → list/get tools and queries
// "write" → task/contact/sidecar mutations
// "admin" → structural/destructive surface (board conversion; webhooks and
//           automations once they land)
//
// Scopes are exact-match classes, not a hierarchy: a write-only token cannot
// read, an admin-only token cannot write. The tokens UI nudges users toward
// sensible combinations instead of the code implying one scope from another.

export const TOKEN_SCOPES = ["read", "write", "admin"] as const;

export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const TOKEN_SCOPE_DESCRIPTIONS: Record<TokenScope, string> = {
  read: "List and read workspaces, boards, tasks, and contacts",
  write: "Create and update tasks, contacts, links, and sidecars",
  admin: "Structural changes (board conversion, webhooks, automations)",
};

/**
 * Tokens created before scopes existed have an empty scopes array and are
 * grandfathered as full access until rotated (§5 of UPGRADE-PLAN.md).
 */
export function isGrandfathered(stored: readonly string[]): boolean {
  return stored.length === 0;
}

/**
 * Map a token's stored scopes to the scopes it effectively has. Empty =
 * grandfathered full access; otherwise only known scope values count.
 */
export function effectiveScopes(stored: readonly string[]): TokenScope[] {
  if (isGrandfathered(stored)) return [...TOKEN_SCOPES];
  return TOKEN_SCOPES.filter((s) => stored.includes(s));
}
