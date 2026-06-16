import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getWorkspaceBySlug,
  listWorkspaceMembers,
} from "@/server/queries/workspaces";
import { db } from "@/lib/db";
import { Role } from "@prisma/client";
import { InviteMemberCard } from "@/components/workspace/invite-member-card";
import { MembersTable } from "@/components/workspace/members-table";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const [session, { workspaceSlug }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  const [members, invitations] = await Promise.all([
    listWorkspaceMembers(workspace.id),
    db.invitation.findMany({
      where: { workspaceId: workspace.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const myRole = workspace.members[0]?.role ?? Role.MEMBER;
  const canManage = myRole === Role.OWNER || myRole === Role.ADMIN;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {members.length} member{members.length === 1 ? "" : "s"} in{" "}
        {workspace.name}
      </p>

      {canManage && (
        <div className="mt-8">
          <InviteMemberCard workspaceId={workspace.id} />
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Team</h2>
        <MembersTable
          workspaceId={workspace.id}
          currentUserId={session.user.id}
          members={members}
          invitations={invitations}
          myRole={myRole}
        />
      </section>
    </main>
  );
}
