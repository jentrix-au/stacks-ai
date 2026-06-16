import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { taskPrefixFromSlug, uniqueSlug, slugify } from "@/lib/slug";

/**
 * Provision a personal workspace for a new user. Called from the Auth.js
 * `createUser` event. Idempotent — re-running is a no-op for an existing
 * member.
 */
export async function ensurePersonalWorkspace(
  userId: string,
  name?: string | null,
  email?: string | null,
) {
  const existing = await db.workspaceMember.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existing) return;

  const displayName =
    (name?.trim() || email?.split("@")[0] || "My workspace") + "'s workspace";
  const desired = slugify(name?.trim() || email?.split("@")[0] || "personal");
  const slug = await uniqueSlug(desired, async (candidate) => {
    const hit = await db.workspace.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    return !!hit;
  });

  await db.workspace.create({
    data: {
      name: displayName,
      slug,
      taskPrefix: taskPrefixFromSlug(slug),
      members: { create: { userId, role: Role.OWNER } },
      counter: { create: {} },
    },
  });
}
