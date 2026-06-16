import { cache } from "react";
import { db } from "@/lib/db";

export const listWorkspaceContacts = cache(
  async (workspaceId: string, opts: { includeArchived?: boolean } = {}) => {
    return db.contact.findMany({
      where: {
        workspaceId,
        ...(opts.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        externalId: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { deals: true, tickets: true } },
      },
    });
  },
);

export type WorkspaceContact = Awaited<
  ReturnType<typeof listWorkspaceContacts>
>[number];
