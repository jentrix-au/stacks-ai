"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BoardKind, Role } from "@prisma/client";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { requireBoardAccess } from "@/lib/authz";
import * as boardOps from "@/server/boards/operations";
import {
  ConvertBoardKindSchema,
  CreateBoardSchema,
  RenameBoardSchema,
} from "@/server/boards/schemas";

export async function createBoard(formData: FormData) {
  const user = await requireUser();
  const data = CreateBoardSchema.parse({
    workspaceId: formData.get("workspaceId"),
    name: formData.get("name"),
    kind: (formData.get("kind") as BoardKind | null) ?? undefined,
  });
  const board = await boardOps.createBoard(user.id, data);
  redirect(`/${board.workspaceSlug}/board/${board.slug}`);
}

export async function renameBoard(formData: FormData) {
  const user = await requireUser();
  const data = RenameBoardSchema.parse({
    boardId: formData.get("boardId"),
    name: formData.get("name"),
  });
  return boardOps.renameBoard(user.id, data);
}

export async function convertBoardKind(
  input: z.infer<typeof ConvertBoardKindSchema>,
) {
  const user = await requireUser();
  return boardOps.convertBoardKind(
    user.id,
    ConvertBoardKindSchema.parse(input),
  );
}

const ArchiveBoard = z.object({ boardId: z.string().min(1) });

export async function archiveBoard(formData: FormData) {
  const user = await requireUser();
  const data = ArchiveBoard.parse({ boardId: formData.get("boardId") });
  const board = await requireBoardAccess(user.id, data.boardId, Role.ADMIN);
  await db.board.update({
    where: { id: board.id },
    data: { archivedAt: new Date() },
  });
  const updated = await db.board.findUnique({
    where: { id: board.id },
    include: { workspace: { select: { slug: true } } },
  });
  if (updated) {
    revalidatePath(`/${updated.workspace.slug}`);
    redirect(`/${updated.workspace.slug}`);
  }
}
