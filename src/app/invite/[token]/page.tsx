import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/server/actions/workspaces";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [session, { token }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) {
    redirect(`/login?invite=${encodeURIComponent(token)}`);
  }

  const invitation = await db.invitation.findUnique({
    where: { token },
    include: { workspace: { select: { name: true, slug: true } } },
  });

  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.expiresAt < new Date()
  ) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold">Invitation unavailable</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            This invitation is invalid, expired, or already used.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Join {invitation.workspace.name}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          You&rsquo;ve been invited to join {invitation.workspace.name} as a{" "}
          {invitation.role.toLowerCase()}.
        </p>

        <form
          action={async () => {
            "use server";
            await acceptInvitation(token);
          }}
          className="mt-8"
        >
          <Button type="submit" className="w-full">
            Accept invite
          </Button>
        </form>
      </div>
    </main>
  );
}
