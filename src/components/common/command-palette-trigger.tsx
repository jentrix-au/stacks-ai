"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "./command-palette";

export function CommandPaletteTrigger({
  workspace,
}: {
  workspace: { id: string; slug: string };
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground gap-2 px-2"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="border-border bg-muted hidden rounded border px-1 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} workspace={workspace} />
    </>
  );
}
