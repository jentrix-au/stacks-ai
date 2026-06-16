import { revalidatePath } from "next/cache";
import { BoardKind, Role } from "@prisma/client";

import { db } from "@/lib/db";
import {
  AuthzError,
  requireBoardAccess,
  requireWorkspaceRole,
} from "@/lib/authz";
import { POSITION_STEP } from "@/lib/position";
import { emitBoardEvent } from "@/lib/events";
import { uniqueSlug } from "@/lib/slug";

import { sidecarTaskIdsFor } from "./convert-plan";
import type {
  ConvertBoardKindInput,
  CreateBoardInput,
  RenameBoardInput,
} from "./schemas";

/** Default columns seeded per board kind at creation. */
export const DEFAULT_COLUMNS: Record<BoardKind, string[]> = {
  [BoardKind.TASKS]: ["Backlog", "In progress", "In review", "Done"],
  [BoardKind.CRM]: [
    "Lead",
    "Qualified",
    "Proposal",
    "Negotiation",
    "Won",
    "Lost",
  ],
  [BoardKind.SUPPORT]: [
    "New",
    "Open",
    "Waiting on customer",
    "Resolved",
    "Closed",
  ],
  [BoardKind.BUGS]: [
    "Triage",
    "Open",
    "In progress",
    "Fixed",
    "Verified",
    "Closed",
  ],
  [BoardKind.ROADMAP]: [
    "Discovery",
    "In design",
    "In build",
    "Shipped",
    "Won't do",
  ],
};

export async function createBoard(
  userId: string,
  input: CreateBoardInput,
): Promise<{
  id: string;
  name: string;
  slug: string;
  kind: BoardKind;
  workspaceSlug: string;
}> {
  await requireWorkspaceRole(userId, input.workspaceId);

  const slug = await uniqueSlug(input.name, async (candidate) => {
    const hit = await db.board.findFirst({
      where: { workspaceId: input.workspaceId, slug: candidate },
      select: { id: true },
    });
    return !!hit;
  });

  const kind = input.kind ?? BoardKind.TASKS;
  const board = await db.board.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      slug,
      kind,
      columns: {
        create: DEFAULT_COLUMNS[kind].map((name, i) => ({
          name,
          position: (i + 1) * POSITION_STEP,
        })),
      },
    },
    include: { workspace: { select: { slug: true } } },
  });

  revalidatePath(`/${board.workspace.slug}`);
  return {
    id: board.id,
    name: board.name,
    slug: board.slug,
    kind: board.kind,
    workspaceSlug: board.workspace.slug,
  };
}

export async function renameBoard(
  userId: string,
  input: RenameBoardInput,
): Promise<{ name: string }> {
  const board = await requireBoardAccess(userId, input.boardId);
  const updated = await db.board.update({
    where: { id: board.id },
    data: { name: input.name },
    include: { workspace: { select: { slug: true } } },
  });
  await emitBoardEvent(updated.id, "board.renamed", { name: updated.name });
  revalidatePath(`/${updated.workspace.slug}/board/${updated.slug}`);
  return { name: updated.name };
}

/**
 * Convert a board to a different kind (ADMIN only). Eagerly backfills the
 * target kind's sidecar on every non-archived task in one transaction so the
 * UI/MCP can edit sidecars without an upsert path (same invariant createTask
 * maintains). Columns are NOT reseeded and other-kind sidecars are preserved.
 */
// Note: no `source` param — board-level changes write no task Activity rows
// (matches renameBoard/archiveBoard), so there is nothing to attribute yet.
export async function convertBoardKind(
  userId: string,
  input: ConvertBoardKindInput,
): Promise<{ kind: ConvertBoardKindInput["kind"]; backfilled: number }> {
  const board = await requireBoardAccess(userId, input.boardId, Role.ADMIN);

  const current = await db.board.findUnique({
    where: { id: board.id },
    select: {
      kind: true,
      slug: true,
      workspace: { select: { slug: true } },
    },
  });
  if (!current) throw new AuthzError("Board not found", 404);
  if (current.kind === input.kind) {
    return { kind: input.kind, backfilled: 0 };
  }

  const tasks = await db.task.findMany({
    where: {
      archivedAt: null,
      column: { archivedAt: null, boardId: board.id },
    },
    select: {
      id: true,
      deal: { select: { id: true } },
      bugReport: { select: { id: true } },
      ticket: { select: { id: true } },
      initiative: { select: { id: true } },
    },
  });
  const targetIds = sidecarTaskIdsFor(
    input.kind,
    tasks.map((t) => ({
      id: t.id,
      hasDeal: !!t.deal,
      hasBugReport: !!t.bugReport,
      hasTicket: !!t.ticket,
      hasInitiative: !!t.initiative,
    })),
  );

  const rows = targetIds.map((taskId) => ({ taskId }));
  await db.$transaction([
    db.board.update({ where: { id: board.id }, data: { kind: input.kind } }),
    ...(rows.length === 0
      ? []
      : input.kind === "CRM"
        ? [db.deal.createMany({ data: rows, skipDuplicates: true })]
        : input.kind === "BUGS"
          ? [db.bugReport.createMany({ data: rows, skipDuplicates: true })]
          : input.kind === "SUPPORT"
            ? [db.ticket.createMany({ data: rows, skipDuplicates: true })]
            : input.kind === "ROADMAP"
              ? [db.initiative.createMany({ data: rows, skipDuplicates: true })]
              : []),
  ]);

  revalidatePath(`/${current.workspace.slug}/board/${current.slug}`);
  await emitBoardEvent(board.id, "board.kind_changed", {
    kind: input.kind,
  });
  return { kind: input.kind, backfilled: targetIds.length };
}
