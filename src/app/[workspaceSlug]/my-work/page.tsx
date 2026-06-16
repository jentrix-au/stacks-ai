import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { CalendarClock, ListTodo } from "lucide-react";
import { auth } from "@/auth";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import { getMyWork, type MyWorkTask } from "@/server/queries/my-work";
import { BoardKindBadge } from "@/components/board/board-kind-badge";

export default async function MyWorkPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const [session, { workspaceSlug }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  const work = await getMyWork(session.user.id, workspace.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My Work</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {work.total === 0
            ? `Nothing assigned to you in ${workspace.name}.`
            : `${work.total} open task${work.total === 1 ? "" : "s"} assigned to you across ${workspace.name}.`}
        </p>
      </header>

      {work.total === 0 ? (
        <div className="text-muted-foreground mt-16 flex flex-col items-center gap-2 text-sm">
          <ListTodo className="size-6 opacity-50" />
          Tasks assigned to you will show up here, grouped by urgency.
        </div>
      ) : (
        <>
          <TaskGroup
            title="Overdue"
            tone="overdue"
            tasks={work.overdue}
            workspaceSlug={workspace.slug}
          />
          <TaskGroup
            title="Due today"
            tone="due"
            tasks={work.dueToday}
            workspaceSlug={workspace.slug}
          />
          <TaskGroup
            title="Assigned to me"
            tasks={work.assigned}
            workspaceSlug={workspace.slug}
          />
        </>
      )}
    </main>
  );
}

function TaskGroup({
  title,
  tone,
  tasks,
  workspaceSlug,
}: {
  title: string;
  tone?: "overdue" | "due";
  tasks: MyWorkTask[];
  workspaceSlug: string;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="mt-8">
      <h2
        className={
          "text-xs font-medium tracking-wide uppercase " +
          (tone === "overdue"
            ? "text-red-600 dark:text-red-400"
            : tone === "due"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground")
        }
      >
        {title} · {tasks.length}
      </h2>
      <ul className="mt-2 divide-y rounded-lg border">
        {tasks.map((t) => (
          <li key={t.id}>
            <Link
              href={`/${workspaceSlug}/board/${t.boardSlug}?task=${t.id}`}
              className="hover:bg-muted/50 flex items-center gap-3 px-3 py-2.5"
            >
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                {t.key}
              </span>
              <span className="truncate text-sm">{t.title}</span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {t.dueAt && (
                  <span
                    className={
                      "flex items-center gap-1 text-xs " +
                      (tone === "overdue"
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground")
                    }
                  >
                    <CalendarClock className="size-3" />
                    {format(t.dueAt, "MMM d")}
                  </span>
                )}
                <span className="text-muted-foreground hidden text-xs sm:inline">
                  {t.boardName} · {t.columnName}
                </span>
                <BoardKindBadge kind={t.boardKind} size="xs" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
