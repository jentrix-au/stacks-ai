import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getWorkspaceBySlug,
  listMyWorkspaces,
} from "@/server/queries/workspaces";
import { unreadNotificationCount } from "@/server/notifications";
import { WorkspaceTopBar } from "@/components/workspace/topbar";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const [session, { workspaceSlug }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) redirect("/login");

  const [workspace, workspaces] = await Promise.all([
    getWorkspaceBySlug(workspaceSlug, session.user.id),
    listMyWorkspaces(session.user.id),
  ]);
  const unread = await unreadNotificationCount(session.user.id, workspace.id);

  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceTopBar
        workspace={{
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
        }}
        workspaces={workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
        }))}
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          image: session.user.image ?? null,
        }}
        unreadNotifications={unread}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
