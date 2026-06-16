"use server";

import { z } from "zod";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import * as columnOps from "@/server/columns/operations";
import {
  ArchiveColumnSchema,
  CreateColumnSchema,
  MoveColumnSchema,
  RenameColumnSchema,
} from "@/server/columns/schemas";

const fullColumnInclude = {
  tasks: {
    where: { archivedAt: null },
    orderBy: { position: "asc" },
    include: {
      labels: { include: { label: true } },
      assignees: {
        include: {
          user: {
            select: { id: true, name: true, image: true, email: true },
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
                    select: { id: true, name: true, slug: true, kind: true },
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
                    select: { id: true, name: true, slug: true, kind: true },
                  },
                },
              },
            },
          },
        },
      },
      _count: {
        select: { comments: true, attachments: true },
      },
    },
  },
} as const;

export async function createColumn(formData: FormData) {
  const user = await requireUser();
  const data = CreateColumnSchema.parse({
    boardId: formData.get("boardId"),
    name: formData.get("name"),
  });
  const created = await columnOps.createColumn(user.id, data);

  // Re-fetch in the board-client display shape (Decimal → number on deals),
  // matching what getBoardBySlug returns for optimistic insertion.
  const column = await db.column.findUniqueOrThrow({
    where: { id: created.id },
    include: fullColumnInclude,
  });
  return {
    ...column,
    tasks: column.tasks.map((t) => ({
      ...t,
      deal: t.deal
        ? {
            ...t.deal,
            amount: t.deal.amount == null ? null : Number(t.deal.amount),
          }
        : null,
    })),
  };
}

export async function renameColumn(formData: FormData) {
  const user = await requireUser();
  const data = RenameColumnSchema.parse({
    columnId: formData.get("columnId"),
    name: formData.get("name"),
  });
  await columnOps.renameColumn(user.id, data);
}

export async function archiveColumn(formData: FormData) {
  const user = await requireUser();
  const data = ArchiveColumnSchema.parse({
    columnId: formData.get("columnId"),
  });
  await columnOps.archiveColumn(user.id, data);
}

export async function moveColumn(input: z.infer<typeof MoveColumnSchema>) {
  const user = await requireUser();
  await columnOps.moveColumn(user.id, MoveColumnSchema.parse(input));
}
