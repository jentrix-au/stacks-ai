import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Server-side helper to fetch the current session. Returns null if not
 * signed in.
 */
export async function getSession() {
  return auth();
}

/**
 * Returns the current user or redirects to /login. Use in protected pages
 * and server actions.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}
