import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";

import { db } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { ensurePersonalWorkspace } from "@/server/workspaces/ensure-personal";
import { isSignInAllowed } from "@/server/auth/signup-gate";
import { markInstanceAdminIfFirst } from "@/server/auth/first-user";

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  providers: [
    ...authConfig.providers,
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.RESEND_FROM ?? "noreply@example.com",
    }),
  ],
  events: {
    async createUser({ user }) {
      if (user.id) {
        // Self-hosted bootstrap: the first user on a fresh DB becomes admin.
        await markInstanceAdminIfFirst(user.id);
        await ensurePersonalWorkspace(user.id, user.name, user.email);
      }
    },
  },
  callbacks: {
    // Sign-up gate: runs before the adapter's `createUser` for every provider,
    // so denying here prevents a new account from ever being made (and stops the
    // magic-link email from being sent). Open by default; see signup-gate.ts.
    async signIn({ user }) {
      return isSignInAllowed(user.email);
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.isAdmin = user.isAdmin ?? false;
      }
      return session;
    },
  },
});
