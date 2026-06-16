"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Contact,
  Moon,
  Plus,
  Search,
  Settings,
  SquareCheckBig,
  SquareKanban,
  Sun,
  Users,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { searchWorkspaceAction } from "@/server/actions/search";
import type { WorkspaceSearchResults } from "@/server/queries/search";

const EMPTY: WorkspaceSearchResults = { tasks: [], boards: [], contacts: [] };

export function CommandPalette({
  open,
  onOpenChange,
  workspace,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspace: { id: string; slug: string };
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkspaceSearchResults>(EMPTY);
  const [searching, setSearching] = useState(false);
  // Controlled cmdk selection: results arrive async, and cmdk would otherwise
  // keep "See all results" (the only item while loading) selected instead of
  // snapping to the first hit.
  const [selected, setSelected] = useState("");
  // Monotonic request id so a slow earlier response can't clobber a newer one.
  const requestSeq = useRef(0);

  const q = query.trim();

  // Reset on close / clear, and flip the "Searching…" hint on as soon as the
  // query changes — compare-during-render (the board-client re-sync pattern)
  // instead of effect-driven setState, which lint rejects as cascading.
  const [prev, setPrev] = useState({ open, q });
  if (prev.open !== open || prev.q !== q) {
    setPrev({ open, q });
    if (!open) {
      setQuery("");
      setResults(EMPTY);
      setSearching(false);
      setSelected("");
    } else if (!q) {
      setResults(EMPTY);
      setSearching(false);
      setSelected("");
    } else {
      setSearching(true);
    }
  }

  // Debounced live search against the workspace.
  useEffect(() => {
    if (!open || !q) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await searchWorkspaceAction({
          workspaceId: workspace.id,
          query: q,
        });
        if (requestSeq.current === seq) {
          setResults(res);
          setSelected(
            res.tasks[0]
              ? `task-${res.tasks[0].id}`
              : res.boards[0]
                ? `board-${res.boards[0].id}`
                : res.contacts[0]
                  ? `contact-${res.contacts[0].id}`
                  : "see-all-results",
          );
        }
      } finally {
        if (requestSeq.current === seq) setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [open, q, workspace.id]);

  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* shouldFilter=false: results are already server-filtered. */}
      <Command
        shouldFilter={false}
        value={selected}
        onValueChange={setSelected}
      >
        <CommandInput
          placeholder="Search tasks, boards, people…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>{searching ? "Searching…" : "No results."}</CommandEmpty>
          {q && results.tasks.length > 0 && (
            <CommandGroup heading="Tasks">
              {results.tasks.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`task-${t.id}`}
                  onSelect={() =>
                    run(() =>
                      router.push(
                        `/${workspace.slug}/board/${t.boardSlug}?task=${t.id}`,
                      ),
                    )
                  }
                >
                  <SquareCheckBig className="size-3.5" />
                  <span className="text-muted-foreground font-mono text-xs">
                    {t.key}
                  </span>
                  <span className="truncate">{t.title}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {t.boardName}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {q && results.boards.length > 0 && (
            <CommandGroup heading="Boards">
              {results.boards.map((b) => (
                <CommandItem
                  key={b.id}
                  value={`board-${b.id}`}
                  onSelect={() =>
                    run(() =>
                      router.push(`/${workspace.slug}/board/${b.slug}`),
                    )
                  }
                >
                  <SquareKanban className="size-3.5" />
                  <span className="truncate">{b.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {q && results.contacts.length > 0 && (
            <CommandGroup heading="People">
              {results.contacts.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`contact-${c.id}`}
                  onSelect={() =>
                    run(() => router.push(`/${workspace.slug}/contacts`))
                  }
                >
                  <Contact className="size-3.5" />
                  <span className="truncate">{c.name}</span>
                  {(c.email || c.company) && (
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                      {c.email ?? c.company}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {q && (
            <CommandGroup heading="Search">
              <CommandItem
                value="see-all-results"
                onSelect={() =>
                  run(() =>
                    router.push(
                      `/${workspace.slug}/search?q=${encodeURIComponent(q)}`,
                    ),
                  )
                }
              >
                <Search className="size-3.5" />
                See all results for “{q}”
              </CommandItem>
            </CommandGroup>
          )}
          {!q && (
            <>
              <CommandGroup heading="Quick actions">
                <CommandItem
                  onSelect={() =>
                    run(() => router.push("/onboarding/new-workspace"))
                  }
                >
                  <Plus className="size-3.5" />
                  Create workspace
                </CommandItem>
                <CommandItem
                  onSelect={() =>
                    run(() => router.push(`/${workspace.slug}/members`))
                  }
                >
                  <Users className="size-3.5" />
                  Invite members
                </CommandItem>
                <CommandItem
                  onSelect={() =>
                    run(() => router.push(`/${workspace.slug}/settings`))
                  }
                >
                  <Settings className="size-3.5" />
                  Workspace settings
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Appearance">
                <CommandItem onSelect={() => run(() => setTheme("light"))}>
                  <Sun className="size-3.5" /> Light theme
                </CommandItem>
                <CommandItem onSelect={() => run(() => setTheme("dark"))}>
                  <Moon className="size-3.5" /> Dark theme
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
