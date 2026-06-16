import Link from "next/link";
import { redirect } from "next/navigation";
import { Contact, Search, SquareCheckBig } from "lucide-react";
import { auth } from "@/auth";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import { searchWorkspace } from "@/server/queries/search";
import { Input } from "@/components/ui/input";
import { BoardKindBadge } from "@/components/board/board-kind-badge";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const [session, { workspaceSlug }, sp] = await Promise.all([
    auth(),
    params,
    searchParams,
  ]);
  if (!session?.user?.id) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const results = q
    ? await searchWorkspace(session.user.id, {
        workspaceId: workspace.id,
        query: q,
        takePerType: 25,
      })
    : null;

  const total = results
    ? results.tasks.length + results.boards.length + results.contacts.length
    : 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tasks, boards, and people across {workspace.name}.
        </p>
      </header>

      <form method="GET" className="mt-6 flex items-center gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search tasks, boards, people…"
          aria-label="Search query"
          autoFocus
          className="max-w-md"
        />
      </form>

      {results && total === 0 && (
        <p className="text-muted-foreground mt-10 text-sm">
          No results for “{q}”.
        </p>
      )}

      {results && results.tasks.length > 0 && (
        <section className="mt-8">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Tasks
          </h2>
          <ul className="mt-2 divide-y rounded-lg border">
            {results.tasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/${workspace.slug}/board/${t.boardSlug}?task=${t.id}`}
                  className="hover:bg-muted/50 flex items-center gap-3 px-3 py-2.5"
                >
                  <SquareCheckBig className="text-muted-foreground size-4 shrink-0" />
                  <span className="text-muted-foreground shrink-0 font-mono text-xs">
                    {t.key}
                  </span>
                  <span className="truncate text-sm">{t.title}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {t.boardName} · {t.columnName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results && results.boards.length > 0 && (
        <section className="mt-8">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Boards
          </h2>
          <ul className="mt-2 divide-y rounded-lg border">
            {results.boards.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/${workspace.slug}/board/${b.slug}`}
                  className="hover:bg-muted/50 flex items-center gap-3 px-3 py-2.5"
                >
                  <span className="truncate text-sm">{b.name}</span>
                  <BoardKindBadge kind={b.kind} className="ml-auto" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results && results.contacts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            People
          </h2>
          <ul className="mt-2 divide-y rounded-lg border">
            {results.contacts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/${workspace.slug}/contacts`}
                  className="hover:bg-muted/50 flex items-center gap-3 px-3 py-2.5"
                >
                  <Contact className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate text-sm">{c.name}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {[c.email, c.company].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!results && (
        <div className="text-muted-foreground mt-16 flex flex-col items-center gap-2 text-sm">
          <Search className="size-6 opacity-50" />
          Type a query and press Enter — or use ⌘K anywhere.
        </div>
      )}
    </main>
  );
}
