import { db } from "@/lib/db";

/**
 * Sign-up gate — the single source of truth for whether an email may
 * authenticate. Enforced in the Auth.js `signIn` callback (`src/auth.ts`), which
 * runs BEFORE the adapter's `createUser` for every provider (Google OAuth
 * callback, Resend magic-link request, and the magic-link click); the email
 * server action pre-checks it too, so we never send a magic link to an address
 * that can't sign in.
 *
 * This open-source build defaults to OPEN registration: anyone can sign in and
 * self-serves into their own personal workspace, and the first user on a fresh
 * database becomes the instance admin (see `first-user.ts`). Set
 * `OPEN_SIGNUP=false` to switch to invite-only, where a new account is created
 * only for the first-ever user (empty-DB bootstrap), an allowlisted address, or
 * an email with a pending, unexpired workspace invitation. Existing users always
 * sign in.
 */

/** Shared, user-facing copy for a blocked sign-in (login page + email action). */
export const NOT_INVITED_MESSAGE =
  "Stacks is invite-only right now — ask a workspace admin to send you an invitation.";

/**
 * Registration mode. This open-source build defaults to OPEN (unset/empty =
 * open); set `OPEN_SIGNUP` to "false"/"0"/"no"/"off" to require an invitation.
 */
function isOpenSignup(): boolean {
  const raw = process.env.OPEN_SIGNUP?.trim().toLowerCase();
  if (!raw) return true;
  return !["false", "0", "no", "off"].includes(raw);
}

/**
 * Optional allowlist used in invite-only mode: `SIGNUP_ALLOWLIST` is a
 * comma/space-separated list of full emails (`person@example.com`) and/or domain
 * suffixes (`@example.com`). Unlike a workspace invitation, an allowlisted
 * address signs up into its OWN fresh personal workspace rather than joining an
 * inviter's workspace.
 */
function isAllowlisted(email: string): boolean {
  const raw = process.env.SIGNUP_ALLOWLIST;
  if (!raw) return false;

  const entries = raw
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) return false;

  const at = email.lastIndexOf("@");
  const domain = at === -1 ? "" : email.slice(at); // includes the leading "@"

  return entries.some((entry) =>
    entry.startsWith("@") ? entry === domain : entry === email,
  );
}

/**
 * Whether `rawEmail` may authenticate. Existing users always pass (the gate only
 * blocks NEW accounts). For a new address: in open mode anyone passes; in
 * invite-only mode the first-ever user (empty-DB bootstrap), an allowlisted
 * address, or an email with a pending, unexpired invitation passes. Email
 * comparison is case-insensitive throughout.
 */
export async function isSignInAllowed(
  rawEmail: string | null | undefined,
): Promise<boolean> {
  const email = rawEmail?.trim().toLowerCase();
  if (!email) return false;

  // Existing users can always sign in again.
  const existing = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return true;

  // Beyond this point, allowing the sign-in would create a NEW account.

  // Open registration (self-hosted default): anyone may sign up.
  if (isOpenSignup()) return true;

  // --- Invite-only mode ---

  // Bootstrap: the very first user on an empty instance is always allowed (and
  // becomes the admin), so a fresh deployment is never locked out of itself.
  const userCount = await db.user.count();
  if (userCount === 0) return true;

  if (isAllowlisted(email)) return true;

  const invitation = await db.invitation.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return invitation !== null;
}
