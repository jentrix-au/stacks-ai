import { db } from "./db";

export const REQUESTS_PER_MINUTE = 60;

// Deliberately NOT a TokenError subclass: extending across the
// api-tokens ⇄ rate-limit import cycle would evaluate before TokenError
// initializes (TDZ) depending on load order.
export class RateLimitError extends Error {
  status = 429 as const;
  /** Seconds until the current minute bucket rolls over. */
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function currentMinuteBucket(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `minute:${y}-${m}-${d}T${h}:${min}`;
}

export function secondsUntilNextMinute(now: Date = new Date()): number {
  return 60 - now.getUTCSeconds();
}

/**
 * Sliding-bucket rate limiter. The increment is a single atomic upsert
 * (`INSERT … ON CONFLICT … SET count = count + 1`) so concurrent requests
 * can't race past the limit; the post-increment count decides.
 *
 * Throws `RateLimitError` (a 429 `TokenError` carrying `retryAfterSeconds`)
 * when the bucket is over the limit.
 */
export async function enforceRateLimit(
  tokenId: string,
  now: Date = new Date(),
): Promise<void> {
  const bucket = currentMinuteBucket(now);
  const row = await db.apiTokenRateLimit.upsert({
    where: { tokenId_bucket: { tokenId, bucket } },
    create: { tokenId, bucket, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.count > REQUESTS_PER_MINUTE) {
    throw new RateLimitError(
      `Rate limit exceeded (${REQUESTS_PER_MINUTE} requests/min)`,
      secondsUntilNextMinute(now),
    );
  }
}
