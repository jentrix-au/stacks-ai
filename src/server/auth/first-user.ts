import { db } from "@/lib/db";

/**
 * Open-source / self-hosted bootstrap: the first user to sign in on a fresh
 * database becomes the instance admin (`User.isAdmin`).
 *
 * Called from the Auth.js `createUser` event, which fires AFTER the adapter has
 * inserted the row — so for the very first account `db.user.count()` is exactly
 * 1. It's a no-op once any other user exists, so re-running is safe and only the
 * genuine first account is ever promoted.
 *
 * The only race is two brand-new users authenticating at the very same instant
 * (both observing count 1). That's harmless for a single-operator bootstrap — at
 * worst a freshly stood-up instance ends up with two admins — so we don't pay
 * for a serializable transaction here.
 */
export async function markInstanceAdminIfFirst(userId: string): Promise<void> {
  const userCount = await db.user.count();
  if (userCount === 1) {
    await db.user.update({ where: { id: userId }, data: { isAdmin: true } });
  }
}
