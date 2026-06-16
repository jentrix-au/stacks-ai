import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe base config used by `proxy.ts`. We deliberately do NOT enforce
 * session checks here — Auth.js v5 can't read database sessions in the Edge
 * runtime, and JWT sessions don't match our DB-backed strategy. Every
 * protected page/server-action calls `auth()` from `auth.ts` itself (Node
 * runtime) and redirects to /login on its own, which works correctly with
 * the Prisma session table.
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    verifyRequest: "/login?check-email=1",
    // Surface auth errors (e.g. AccessDenied from the sign-up gate) on our
    // own login page as `?error=<code>` instead of the default Auth.js page.
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
} satisfies NextAuthConfig;
