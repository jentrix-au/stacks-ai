import Link from "next/link";
import { ArrowRight, ListTodo, Plus } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import { listBoardsForWorkspace } from "@/server/queries/boards";
import { getMyWork, type MyWorkTask } from "@/server/queries/my-work";
import { listWorkspaceActivity } from "@/server/queries/activity";
import { ACTIVITY_VERBS } from "@/lib/activity-verbs";
import { agentIdentityOf } from "@/lib/activity-source";
import { CreateBoardDialog } from "@/components/workspace/create-board-dialog";
import { AgentBadge } from "@/components/board/agent-badge";
import { BoardKindBadge } from "@/components/board/board-kind-badge";

export default async function WorkspaceBoardsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const [session, { workspaceSlug }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  const [boards, myWork, recentActivity] = await Promise.all([
    listBoardsForWorkspace(workspace.id),
    getMyWork(session.user.id, workspace.id),
    listWorkspaceActivity(workspace.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Boards</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Workspace {workspace.name} · {workspace._count.boards} board
            {workspace._count.boards === 1 ? "" : "s"}
          </p>
        </div>
        <CreateBoardDialog workspaceId={workspace.id} />
      </header>

      {/* My-work digest + recent activity (P3.2) */}
      <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="border-border bg-card rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              <ListTodo className="size-4" />
              My Work
            </h2>
            <Link
              href={`/${workspace.slug}/my-work`}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          {myWork.total === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              Nothing assigned to you right now.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground mt-1 text-xs">
                {myWork.total} open ·{" "}
                <span
                  className={
                    myWork.overdue.length
                      ? "text-red-600 dark:text-red-400"
                      : undefined
                  }
                >
                  {myWork.overdue.length} overdue
                </span>{" "}
                · {myWork.dueToday.length} due today
              </p>
              <ul className="mt-3 space-y-1">
                {[...myWork.overdue, ...myWork.dueToday, ...myWork.assigned]
                  .slice(0, 5)
                  .map((t) => (
                    <DigestTaskRow
                      key={t.id}
                      task={t}
                      workspaceSlug={workspace.slug}
                    />
                  ))}
              </ul>
            </>
          )}
        </section>

        <section className="border-border bg-card rounded-xl border p-4">
          <h2 className="text-sm font-medium">Recent activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              No activity yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {recentActivity.map((a) => {
                const agent = agentIdentityOf(a.payload);
                return (
                  <li
                    key={a.id}
                    className="text-muted-foreground flex items-baseline gap-1.5 text-xs"
                  >
                    <span className="text-foreground shrink-0 font-medium">
                      {a.actor?.name ?? a.actor?.email ?? "System"}
                    </span>
                    {agent ? (
                      <span className="shrink-0">
                        <AgentBadge name={agent.name} emoji={agent.emoji} />
                      </span>
                    ) : null}
                    <span className="truncate">
                      {ACTIVITY_VERBS[a.type]?.label ??
                        a.type.toLowerCase().replace(/_/g, " ")}
                    </span>
                    <Link
                      href={`/${workspace.slug}/board/${a.task.column.board.slug}?task=${a.task.id}`}
                      className="hover:text-foreground shrink-0 font-mono"
                    >
                      {workspace.taskPrefix}-{a.task.number}
                    </Link>
                    <span className="ml-auto shrink-0">
                      {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {boards.length === 0 ? (
        <EmptyBoardsState workspaceId={workspace.id} />
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <li key={b.id}>
              <Link
                href={`/${workspace.slug}/board/${b.slug}`}
                className="group border-border bg-card hover:border-foreground/20 block rounded-xl border p-4 transition-all hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm leading-snug font-medium">{b.name}</h2>
                  <span className="text-muted-foreground font-mono text-[10px] uppercase">
                    {b._count.columns} col
                  </span>
                </div>
                <div className="mt-6 flex items-center justify-between gap-2">
                  <BoardKindBadge kind={b.kind} />
                  <span className="text-muted-foreground text-xs">
                    Updated {format(b.updatedAt, "MMM d, yyyy")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function DigestTaskRow({
  task,
  workspaceSlug,
}: {
  task: MyWorkTask;
  workspaceSlug: string;
}) {
  const overdue =
    task.dueAt !== null &&
    task.dueAt < new Date(new Date().setHours(0, 0, 0, 0));
  return (
    <li>
      <Link
        href={`/${workspaceSlug}/board/${task.boardSlug}?task=${task.id}`}
        className="hover:bg-muted/50 -mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-sm"
      >
        <span className="text-muted-foreground shrink-0 font-mono text-xs">
          {task.key}
        </span>
        <span className="truncate">{task.title}</span>
        {task.dueAt && (
          <span
            className={
              "ml-auto shrink-0 text-xs " +
              (overdue
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground")
            }
          >
            {format(task.dueAt, "MMM d")}
          </span>
        )}
      </Link>
    </li>
  );
}

function EmptyBoardsState({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="border-border mt-16 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
        <Plus className="size-6" />
      </div>
      <h2 className="mt-6 text-base font-semibold">Create your first board</h2>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Boards organize work into columns and cards. You&rsquo;ll get a default
        Backlog → In progress → In review → Done flow to start.
      </p>
      <div className="mt-6">
        <CreateBoardDialog workspaceId={workspaceId} />
      </div>
    </div>
  );
}
