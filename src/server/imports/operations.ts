import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { AuthzError, requireBoardAccess, requireWorkspaceRole } from "@/lib/authz";
import { bulkCreateTasks } from "@/server/tasks/operations";
import { createBoard } from "@/server/boards/operations";
import { createColumn } from "@/server/columns/operations";
import type {
  ContactImportRow,
  ImportContactsInput,
  ImportTasksInput,
  TrelloImportInput,
} from "./schemas";

/**
 * CSV / Trello imports (P3.8). ADMIN-role gated (imports mass-create data).
 * Contacts are idempotent by externalId, then by lower(email) — re-running
 * the same file updates instead of duplicating. Tasks batch through the
 * P2.3 `bulkCreateTasks` op (numbers, activities, sidecars, events) in
 * chunks of 50 so 1k-row files never hit one giant transaction.
 */

const TASK_CHUNK = 50;
const CONTACT_CHUNK = 250;

export interface ContactImportPlan {
  create: number;
  update: number;
  invalid: number;
  /** First few classified rows for the dry-run preview. */
  sample: { name: string; email: string | null; action: "create" | "update" }[];
}

/** Pure-ish classifier shared by dry-run and apply. */
async function planContactImport(
  workspaceId: string,
  rows: ContactImportRow[],
): Promise<{
  creates: ContactImportRow[];
  updates: { id: string; row: ContactImportRow }[];
}> {
  const externalIds = rows
    .map((r) => r.externalId)
    .filter((v): v is string => !!v);
  const emails = rows
    .map((r) => r.email?.toLowerCase())
    .filter((v): v is string => !!v);
  const existing = await db.contact.findMany({
    where: {
      workspaceId,
      OR: [
        ...(externalIds.length ? [{ externalId: { in: externalIds } }] : []),
        ...(emails.length
          ? [{ email: { in: emails, mode: "insensitive" as const } }]
          : []),
      ],
    },
    select: { id: true, email: true, externalId: true },
  });
  const byExternalId = new Map(
    existing.filter((c) => c.externalId).map((c) => [c.externalId!, c.id]),
  );
  const byEmail = new Map(
    existing.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]),
  );

  const creates: ContactImportRow[] = [];
  const updates: { id: string; row: ContactImportRow }[] = [];
  const claimed = new Set<string>();
  for (const row of rows) {
    const match =
      (row.externalId && byExternalId.get(row.externalId)) ||
      (row.email && byEmail.get(row.email.toLowerCase())) ||
      null;
    if (match && !claimed.has(match)) {
      claimed.add(match);
      updates.push({ id: match, row });
    } else {
      creates.push(row);
    }
  }
  return { creates, updates };
}

export async function importContactsPreview(
  userId: string,
  input: ImportContactsInput,
): Promise<ContactImportPlan> {
  await requireWorkspaceRole(userId, input.workspaceId, Role.ADMIN);
  const { creates, updates } = await planContactImport(
    input.workspaceId,
    input.rows,
  );
  return {
    create: creates.length,
    update: updates.length,
    invalid: 0, // invalid rows are rejected by the schema before this point
    sample: [
      ...updates
        .slice(0, 5)
        .map(({ row }) => ({
          name: row.name,
          email: row.email ?? null,
          action: "update" as const,
        })),
      ...creates.slice(0, 5).map((row) => ({
        name: row.name,
        email: row.email ?? null,
        action: "create" as const,
      })),
    ],
  };
}

export async function importContactsApply(
  userId: string,
  input: ImportContactsInput,
): Promise<{ created: number; updated: number }> {
  await requireWorkspaceRole(userId, input.workspaceId, Role.ADMIN);
  const { creates, updates } = await planContactImport(
    input.workspaceId,
    input.rows,
  );

  for (let i = 0; i < creates.length; i += CONTACT_CHUNK) {
    const chunk = creates.slice(i, i + CONTACT_CHUNK);
    await db.contact.createMany({
      data: chunk.map((row) => ({
        workspaceId: input.workspaceId,
        name: row.name,
        email: row.email ?? null,
        phone: row.phone ?? null,
        company: row.company ?? null,
        externalId: row.externalId ?? null,
        createdById: userId,
      })),
    });
  }
  for (let i = 0; i < updates.length; i += CONTACT_CHUNK) {
    const chunk = updates.slice(i, i + CONTACT_CHUNK);
    await db.$transaction(
      chunk.map(({ id, row }) =>
        db.contact.update({
          where: { id },
          data: {
            name: row.name,
            ...(row.email !== undefined ? { email: row.email } : {}),
            ...(row.phone !== undefined ? { phone: row.phone } : {}),
            ...(row.company !== undefined ? { company: row.company } : {}),
            ...(row.externalId !== undefined
              ? { externalId: row.externalId }
              : {}),
          },
        }),
      ),
    );
  }
  return { created: creates.length, updated: updates.length };
}

export interface TaskImportPlan {
  create: number;
  skippedExisting: number;
}

export async function importTasksPreview(
  userId: string,
  input: ImportTasksInput,
): Promise<TaskImportPlan> {
  const { rows } = await planTaskImport(userId, input);
  return {
    create: rows.length,
    skippedExisting: input.rows.length - rows.length,
  };
}

async function planTaskImport(userId: string, input: ImportTasksInput) {
  const column = await db.column.findFirst({
    where: { id: input.columnId, archivedAt: null },
    select: { id: true, boardId: true },
  });
  if (!column) throw new AuthzError("Column not found", 404);
  const board = await requireBoardAccess(userId, column.boardId);
  await requireWorkspaceRole(userId, board.workspaceId, Role.ADMIN);

  if (!input.skipExistingTitles) return { column, rows: input.rows };
  const titles = input.rows.map((r) => r.title);
  const existing = await db.task.findMany({
    where: {
      archivedAt: null,
      column: { boardId: column.boardId, archivedAt: null },
      title: { in: titles },
    },
    select: { title: true },
  });
  const taken = new Set(existing.map((t) => t.title));
  return { column, rows: input.rows.filter((r) => !taken.has(r.title)) };
}

export async function importTasksApply(
  userId: string,
  input: ImportTasksInput,
): Promise<{ created: number; skippedExisting: number }> {
  const { rows } = await planTaskImport(userId, input);
  let created = 0;
  for (let i = 0; i < rows.length; i += TASK_CHUNK) {
    const chunk = rows.slice(i, i + TASK_CHUNK);
    const result = await bulkCreateTasks(
      userId,
      {
        columnId: input.columnId,
        tasks: chunk.map((r) => ({
          title: r.title,
          description: r.description ?? undefined,
          priority: r.priority ?? undefined,
          dueAt: r.dueAt ?? undefined,
        })),
      },
      "ui",
    );
    created += result.created;
  }
  return { created, skippedExisting: input.rows.length - rows.length };
}

export async function importTrelloBoard(
  userId: string,
  input: TrelloImportInput,
): Promise<{ boardSlug: string; columns: number; cards: number }> {
  await requireWorkspaceRole(userId, input.workspaceId, Role.ADMIN);
  const board = await createBoard(userId, {
    workspaceId: input.workspaceId,
    name: input.name,
  });

  // createBoard seeds default columns — archive them so the Trello lists
  // are the only ones. (Simplest path through existing ops.)
  const seeded = await db.column.findMany({
    where: { boardId: board.id, archivedAt: null },
    select: { id: true },
  });
  await db.column.updateMany({
    where: { id: { in: seeded.map((c) => c.id) } },
    data: { archivedAt: new Date() },
  });

  let cards = 0;
  for (const list of input.lists) {
    const column = await createColumn(userId, {
      boardId: board.id,
      name: list.name,
    });
    for (let i = 0; i < list.cards.length; i += TASK_CHUNK) {
      const chunk = list.cards.slice(i, i + TASK_CHUNK);
      const result = await bulkCreateTasks(
        userId,
        {
          columnId: column.id,
          tasks: chunk.map((c) => ({
            title: c.name,
            description: c.desc || undefined,
            dueAt: c.due ?? undefined,
          })),
        },
        "ui",
      );
      cards += result.created;
    }
  }
  return { boardSlug: board.slug, columns: input.lists.length, cards };
}
