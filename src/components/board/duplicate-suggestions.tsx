"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSyncedTransition } from "@/components/sync";
import { addTaskLink } from "@/server/actions/task-links";
import { fetchDuplicateSuggestions } from "@/server/actions/similar";

type Suggestion = Awaited<ReturnType<typeof fetchDuplicateSuggestions>>[number];

/**
 * Duplicate-bug suggestions (P4.3): high-similarity semantic neighbors of
 * this task, proposed as DUPLICATES links. Renders nothing when the
 * embeddings provider is off, the task isn't embedded yet, or nothing
 * clears the similarity threshold — the section is invisible until it has
 * something to say.
 */
export function DuplicateSuggestions({ taskId }: { taskId: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const linkTx = useSyncedTransition();

  useEffect(() => {
    let alive = true;
    fetchDuplicateSuggestions(taskId)
      .then((rows) => {
        if (alive) setSuggestions(rows);
      })
      .catch(() => {
        // Suggestions are best-effort enrichment — stay hidden on failure.
      });
    return () => {
      alive = false;
    };
  }, [taskId]);

  if (suggestions.length === 0) return null;

  async function linkDuplicate(s: Suggestion) {
    const ok = await linkTx.run("link-duplicate", () =>
      addTaskLink({ fromTaskId: taskId, toTaskId: s.id, kind: "DUPLICATES" }),
    );
    if (ok === null) return;
    setSuggestions((prev) => prev.filter((row) => row.id !== s.id));
    toast.success(`Linked as duplicate of ${s.key}`);
  }

  return (
    <div className="bg-muted/30 rounded-md border border-dashed p-2 text-xs">
      <p className="text-muted-foreground flex items-center gap-1.5 font-medium">
        <Copy className="size-3" />
        Possible duplicates
      </p>
      <ul className="mt-1.5 space-y-1">
        {suggestions.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0 font-mono">
              {s.key}
            </span>
            <span className="truncate">{s.title}</span>
            <span className="text-muted-foreground shrink-0">
              {Math.round(s.similarity * 100)}%
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-6 shrink-0 px-2 text-[11px]"
              loading={linkTx.isPending}
              onClick={() => linkDuplicate(s)}
            >
              Link duplicate
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
