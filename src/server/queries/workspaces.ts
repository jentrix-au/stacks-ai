import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export const listMyWorkspaces = cache(async (userId: string) => {
  return db.workspace.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      members: {
        where: { userId },
        select: { role: true },
      },
    },
  });
});

export const getWorkspaceBySlug = cache(
  async (slug: string, userId: string) => {
    const ws = await db.workspace.findUnique({
      where: { slug },
      include: {
        members: {
          where: { userId },
          select: { role: true },
        },
        _count: { select: { boards: true, members: true } },
      },
    });
    if (!ws || ws.members.length === 0) notFound();
    return ws;
  },
);

export const listWorkspaceMembers = cache(async (workspaceId: string) => {
  return db.workspaceMember.findMany({
    where: { workspaceId },
    orderBy: { joinedAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
});
