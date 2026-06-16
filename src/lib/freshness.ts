import { StaleWriteError } from "@/lib/authz";

/**
 * Optimistic-concurrency check (P2.4). No-op when the caller didn't pass
 * `expectedUpdatedAt`; otherwise rejects with a CONFLICT carrying `current`
 * (the entity's present state) when the stored updatedAt is different from
 * the one the caller last read.
 */
export function assertFresh(
  expected: string | null | undefined,
  actualUpdatedAt: Date,
  current: Record<string, unknown>,
): void {
  if (!expected) return;
  if (actualUpdatedAt.getTime() === new Date(expected).getTime()) return;
  throw new StaleWriteError(
    `Stale write rejected: entity was modified at ${actualUpdatedAt.toISOString()}, but expectedUpdatedAt was ${expected}`,
    current,
  );
}
