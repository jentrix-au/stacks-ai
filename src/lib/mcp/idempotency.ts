import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { AuthzError } from "@/lib/authz";
import { db } from "@/lib/db";

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Deterministic JSON (recursively sorted keys) so hashes ignore key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function requestHashFor(
  toolName: string,
  args: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(`${toolName}:${canonicalJson(args)}`)
    .digest("hex");
}

/**
 * Stripe-style idempotency for create_* and bulk_* MCP tools (P2.4).
 *
 * - no `idempotencyKey` in args (or no token id) → just run `fn`.
 * - same (token, key) + same request within TTL → replay the stored
 *   response without re-running `fn`.
 * - same key + DIFFERENT request → CONFLICT (409).
 * - expired rows are overwritten on access (cron sweep lands in P3.6).
 *
 * Best-effort, not a distributed lock: two perfectly-concurrent first
 * requests can both execute; the loser of the insert race replays the
 * winner's stored response.
 */
export async function withIdempotencyKey(
  tokenId: string | null,
  toolName: string,
  args: Record<string, unknown> & { idempotencyKey?: string },
  fn: () => Promise<unknown>,
): Promise<unknown> {
  const key = args.idempotencyKey;
  if (!key || !tokenId) return fn();

  const { idempotencyKey: _omit, ...rest } = args;
  void _omit;
  const requestHash = requestHashFor(toolName, rest);
  const now = Date.now();

  const existing = await db.idempotencyKey.findUnique({
    where: { tokenId_key: { tokenId, key } },
  });
  if (existing && existing.expiresAt.getTime() > now) {
    if (existing.requestHash === requestHash) return existing.response;
    throw new AuthzError(
      `Idempotency key "${key}" was already used with different arguments`,
      409,
    );
  }

  const response = await fn();
  const data = {
    requestHash,
    response: response as Prisma.InputJsonValue,
    expiresAt: new Date(now + IDEMPOTENCY_TTL_MS),
  };
  try {
    await db.idempotencyKey.upsert({
      where: { tokenId_key: { tokenId, key } },
      create: { tokenId, key, ...data },
      update: data,
    });
  } catch {
    // Losing a concurrent upsert race must not fail the (succeeded) call.
  }
  return response;
}
