import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import { ImportExportClient } from "./import-export-client";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const [session, { workspaceSlug }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  const boards = await db.board.findMany({
    where: { workspaceId: workspace.id, archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      columns: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import &amp; export
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          CSV imports for people and tasks, Trello board import, and full
          exports for {workspace.name}.
        </p>
      </header>
      <ImportExportClient
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        boards={boards}
      />
    </main>
  );
}
