import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

import { db } from "./db";
import { enforceRateLimit, RateLimitError } from "./rate-limit";
import { effectiveScopes, type TokenScope } from "./token-scopes";

const TOKEN_PREFIX = "tm_";
/** OAuth access tokens (P2.7) — same storage/verification as PATs. */
export const OAUTH_TOKEN_PREFIX = "tmo_";
/** Accepted bearer prefixes. Refresh tokens (tmr_) are NOT bearer tokens. */
const BEARER_PREFIXES = [TOKEN_PREFIX, OAUTH_TOKEN_PREFIX];
const TOKEN_BYTES = 24;
const HASH_ALGO = "sha256";
const PREFIX_DISPLAY_LEN = 12;
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

export interface GeneratedToken {
  token: string;
  hash: string;
  prefix: string;
}

export function generateToken(prefix: string = TOKEN_PREFIX): GeneratedToken {
  const random = randomBytes(TOKEN_BYTES).toString("base64url");
  const token = `${prefix}${random}`;
  const hash = hashToken(token);
  return { token, hash, prefix: token.slice(0, PREFIX_DISPLAY_LEN) };
}

export function generateOAuthAccessToken(): GeneratedToken {
  return generateToken(OAUTH_TOKEN_PREFIX);
}

export function hashToken(token: string): string {
  return createHash(HASH_ALGO).update(token).digest("hex");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length === 0 || aBuf.length !== bBuf.length) return false;
  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

export class TokenError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TokenError";
    this.status = status;
  }
}

export interface VerifiedToken {
  tokenId: string;
  /** Token display name — attributed on MCP activities (P2.8). */
  tokenName: string;
  /**
   * Agent identity (P4.1): teammate-facing name + emoji avatar rendered on
   * attribution badges. Null = badge falls back to 🤖 + tokenName.
   */
  displayName: string | null;
  emoji: string | null;
  userId: string;
  /**
   * Effective scopes — stored scopes, or all scopes when the token predates
   * scoping (empty array = grandfathered full access until rotated).
   */
  scopes: TokenScope[];
  /** Non-null when the token is restricted to a single workspace. */
  workspaceId: string | null;
  /**
   * Set when this request pushed the token over its per-minute rate limit.
   * The token itself is valid — callers decide how to surface the limit
   * (MCP tool calls return a structured RATE_LIMITED error; a misleading
   * 401 from the auth layer would make agents discard a working token).
   */
  rateLimit?: { retryAfterSeconds: number };
}

export async function verifyToken(token: string): Promise<VerifiedToken> {
  if (!token || !BEARER_PREFIXES.some((p) => token.startsWith(p))) {
    throw new TokenError("Invalid token", 401);
  }
  const hash = hashToken(token);
  const record = await db.apiToken.findUnique({
    where: { tokenHash: hash },
    select: {
      id: true,
      userId: true,
      name: true,
      tokenHash: true,
      scopes: true,
      workspaceId: true,
      displayName: true,
      emoji: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
    },
  });
  if (!record || !constantTimeEqualHex(record.tokenHash, hash)) {
    throw new TokenError("Invalid token", 401);
  }
  if (record.revokedAt) throw new TokenError("Token revoked", 401);
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    throw new TokenError("Token expired", 401);
  }

  let rateLimit: VerifiedToken["rateLimit"];
  try {
    await enforceRateLimit(record.id);
  } catch (e) {
    if (e instanceof RateLimitError) {
      rateLimit = { retryAfterSeconds: e.retryAfterSeconds };
    } else {
      throw e;
    }
  }

  const now = new Date();
  if (
    !record.lastUsedAt ||
    now.getTime() - record.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS
  ) {
    void db.apiToken
      .update({ where: { id: record.id }, data: { lastUsedAt: now } })
      .catch(() => {
        // intentionally swallow — non-critical write
      });
  }

  // Daily usage rollup (P2.8) — fire-and-forget, never blocks the request.
  void db.apiTokenUsage
    .upsert({
      where: { tokenId_day: { tokenId: record.id, day: usageDay(now) } },
      create: { tokenId: record.id, day: usageDay(now), requests: 1 },
      update: { requests: { increment: 1 } },
    })
    .catch(() => {
      // intentionally swallow — non-critical write
    });

  return {
    tokenId: record.id,
    tokenName: record.name,
    displayName: record.displayName,
    emoji: record.emoji,
    userId: record.userId,
    scopes: effectiveScopes(record.scopes),
    workspaceId: record.workspaceId,
    rateLimit,
  };
}

/** UTC day bucket for the usage rollup (matches the @db.Date column). */
export function usageDay(now: Date = new Date()): Date {
  return new Date(now.toISOString().slice(0, 10));
}
