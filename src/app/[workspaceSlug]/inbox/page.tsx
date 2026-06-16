import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import { listMyNotifications } from "@/server/notifications";
import { markAllNotificationsReadAction } from "@/server/actions/notifications";
import { Button } from "@/components/ui/button";
import { NotificationRow, type NotificationView } from "./notification-row";
import { NotifyEmailToggle } from "@/components/account/notify-email-toggle";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const [session, { workspaceSlug }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  const [notifications, me] = await Promise.all([
    listMyNotifications(session.user.id, workspace.id),
    db.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { notifyEmail: true },
    }),
  ]);

  const rows: NotificationView[] = notifications.map((n) => {
    const p = (n.payload ?? {}) as {
      actorName?: string | null;
      taskKey?: string;
      taskTitle?: string;
      boardSlug?: string;
      preview?: string;
    };
    return {
      id: n.id,
      type: n.type,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
      actorName: p.actorName ?? null,
      taskKey: p.taskKey ?? null,
      taskTitle: p.taskTitle ?? null,
      preview: p.preview ?? null,
      href:
        n.taskId && p.boardSlug
          ? `/${workspace.slug}/board/${p.boardSlug}?task=${n.taskId}`
          : null,
    };
  });
  const unread = rows.filter((r) => !r.read).length;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {unread === 0
              ? "You're all caught up."
              : `${unread} unread notification${unread === 1 ? "" : "s"}.`}
          </p>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsReadAction}>
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <input type="hidden" name="workspaceSlug" value={workspace.slug} />
            <Button type="submit" variant="outline" size="sm">
              Mark all read
            </Button>
          </form>
        )}
      </header>

      <div className="mt-4">
        <NotifyEmailToggle initialEnabled={me.notifyEmail} />
      </div>

      {rows.length === 0 ? (
        <div className="text-muted-foreground mt-16 flex flex-col items-center gap-2 text-sm">
          <Inbox className="size-6 opacity-50" />
          Mentions, assignments, and activity on tasks you watch land here.
        </div>
      ) : (
        <ul className="mt-6 divide-y rounded-lg border">
          {rows.map((n) => (
            <NotificationRow key={n.id} notification={n} />
          ))}
        </ul>
      )}
    </main>
  );
}
