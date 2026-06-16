import { cache } from "react";
import { notFound } from "next/navigation";
import { AttachmentStatus } from "@prisma/client";
import { db } from "@/lib/db";

export const listBoardsForWorkspace = cache(async (workspaceId: string) => {
  return db.board.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      background: true,
      kind: true,
      updatedAt: true,
      _count: { select: { columns: true } },
    },
  });
});

export const getBoardBySlug = cache(
  async (workspaceSlug: string, boardSlug: string) => {
    const board = await db.board.findFirst({
      where: {
        slug: boardSlug,
        archivedAt: null,
        workspace: { slug: workspaceSlug },
      },
      include: {
        workspace: {
          select: { id: true, slug: true, name: true, taskPrefix: true },
        },
        labels: { orderBy: { name: "asc" } },
        columns: {
          where: { archivedAt: null },
          orderBy: { position: "asc" },
          include: {
            tasks: {
              where: { archivedAt: null },
              orderBy: { position: "asc" },
              include: {
                labels: { include: { label: true } },
                assignees: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                        email: true,
                      },
                    },
                  },
                },
                subtasks: {
                  orderBy: { position: "asc" },
                  select: {
                    id: true,
                    title: true,
                    completed: true,
                    position: true,
                  },
                },
                deal: {
                  include: {
                    contacts: {
                      include: {
                        contact: {
                          select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                            company: true,
                          },
                        },
                      },
                    },
                  },
                },
                bugReport: true,
                ticket: {
                  include: {
                    contact: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        company: true,
                        externalId: true,
                      },
                    },
                  },
                },
                initiative: true,
                outgoingLinks: {
                  where: { to: { archivedAt: null } },
                  include: {
                    to: {
                      select: {
                        id: true,
                        number: true,
                        title: true,
                        column: {
                          select: {
                            board: {
                              select: {
                                id: true,
                                name: true,
                                slug: true,
                                kind: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                incomingLinks: {
                  where: { from: { archivedAt: null } },
                  include: {
                    from: {
                      select: {
                        id: true,
                        number: true,
                        title: true,
                        column: {
                          select: {
                            board: {
                              select: {
                                id: true,
                                name: true,
                                slug: true,
                                kind: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                _count: {
                  // Only count READY attachments so card badges match what
                  // `listTaskAttachments` actually renders (PENDING/FAILED
                  // uploads are not visible in the attachment grid).
                  select: {
                    comments: true,
                    attachments: {
                      where: { status: AttachmentStatus.READY },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!board) notFound();
    // Prisma's Decimal does not serialize cleanly through RSC → Client Component.
    // Convert deal.amount to a plain number once at the boundary so the rest of
    // the app can treat it as a number (max 13 digits before the decimal — well
    // inside Number.MAX_SAFE_INTEGER).
    return {
      ...board,
      columns: board.columns.map((c) => ({
        ...c,
        tasks: c.tasks.map((t) => ({
          ...t,
          deal: t.deal
            ? {
                ...t.deal,
                amount: t.deal.amount == null ? null : Number(t.deal.amount),
              }
            : null,
        })),
      })),
    };
  },
);

export type FullBoard = Awaited<ReturnType<typeof getBoardBySlug>>;
export type FullColumn = FullBoard["columns"][number];
export type FullTask = FullColumn["tasks"][number];
