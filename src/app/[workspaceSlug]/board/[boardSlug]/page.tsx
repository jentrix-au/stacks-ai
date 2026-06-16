import { redirect } from "next/navigation";
import { BoardKind } from "@prisma/client";
import { auth } from "@/auth";
import { getBoardBySlug } from "@/server/queries/boards";
import { listWorkspaceMembers } from "@/server/queries/workspaces";
import { listWorkspaceContacts } from "@/server/queries/contacts";
import { listWorkspaceLinkTargets } from "@/server/queries/links";
import { listSavedViews } from "@/server/views/operations";
import { BoardClient } from "@/components/board/board-client";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; boardSlug: string }>;
  searchParams: Promise<{ task?: string | string[] }>;
}) {
  const [session, { workspaceSlug, boardSlug }, { task }] = await Promise.all([
    auth(),
    params,
    searchParams,
  ]);
  if (!session?.user?.id) redirect("/login");

  const board = await getBoardBySlug(workspaceSlug, boardSlug);
  const [members, contacts, linkTargets, savedViews] = await Promise.all([
    listWorkspaceMembers(board.workspace.id),
    // Contacts are the single party directory: CRM deals attach many,
    // SUPPORT tickets link one.
    board.kind === BoardKind.CRM || board.kind === BoardKind.SUPPORT
      ? listWorkspaceContacts(board.workspace.id)
      : Promise.resolve([]),
    // Links can connect tasks of any kind, so every board needs the targets.
    listWorkspaceLinkTargets(board.workspace.id),
    listSavedViews(session.user.id, board.id),
  ]);

  return (
    <BoardClient
      board={board}
      // Deep link from search/palette: /board/<slug>?task=<id> opens the panel.
      initialOpenTaskId={typeof task === "string" ? task : null}
      currentUserId={session.user.id}
      workspaceMembers={members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
      }))}
      workspaceContacts={contacts.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        company: c.company,
      }))}
      workspaceLinkTargets={linkTargets}
      savedViews={savedViews}
    />
  );
}
