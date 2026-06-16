"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSyncedTransition } from "@/components/sync";
import { createColumn } from "@/server/actions/columns";
import type { FullColumn } from "@/server/queries/boards";

export function CreateColumn({
  boardId,
  onCreated,
}: {
  boardId: string;
  onCreated: (column: FullColumn) => void;
}) {
  const [active, setActive] = useState(false);
  const [name, setName] = useState("");
  const { isPending, run } = useSyncedTransition();

  async function submit() {
    const value = name.trim();
    if (!value) {
      setActive(false);
      return;
    }
    const fd = new FormData();
    fd.set("boardId", boardId);
    fd.set("name", value);
    const column = await run("create-column", () => createColumn(fd));
    if (!column) return;
    onCreated(column);
    setName("");
    setActive(false);
  }

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground flex h-min w-72 shrink-0 items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm transition-colors"
      >
        <Plus className="size-3.5" />
        Add column
      </button>
    );
  }

  return (
    <div className="bg-muted/40 flex h-min w-72 shrink-0 flex-col gap-2 rounded-xl p-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setName("");
            setActive(false);
          }
        }}
        placeholder="Column name"
        disabled={isPending}
        className="h-7 text-sm"
      />
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          onClick={submit}
          loading={isPending}
          loadingText="Adding…"
        >
          Add column
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setName("");
            setActive(false);
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
