"use client";

import { useState } from "react";
import { Check, Plus, Tag } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pending, useSyncedTransition } from "@/components/sync";
import { setTaskLabels } from "@/server/actions/tasks";
import { createLabel } from "@/server/actions/labels";

const PALETTE = [
  "#ef4444",
  "#f59e0b",
  "#eab308",
  "#22c55e",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
];

type Label = { id: string; name: string; color: string };

export function LabelEditor({
  taskId,
  boardId,
  allLabels,
  selectedIds: initialSelected,
  onChange,
}: {
  taskId: string;
  boardId: string;
  allLabels: Label[];
  selectedIds: string[];
  onChange: (next: Label[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Label[]>(allLabels);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected);
  const [search, setSearch] = useState("");
  const { isPending, run } = useSyncedTransition();

  const selected = labels.filter((l) => selectedIds.includes(l.id));
  const filtered = labels.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()),
  );
  const canCreate =
    search.trim().length > 0 &&
    !labels.some((l) => l.name.toLowerCase() === search.trim().toLowerCase());

  function commit(nextIds: string[]) {
    const prev = selectedIds;
    setSelectedIds(nextIds);
    onChange(labels.filter((l) => nextIds.includes(l.id)));
    run("set-labels", () => setTaskLabels({ taskId, labelIds: nextIds })).then(
      (result) => {
        if (result === null) {
          setSelectedIds(prev);
          onChange(labels.filter((l) => prev.includes(l.id)));
        }
      },
    );
  }

  function toggle(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    commit(next);
  }

  async function createNew() {
    const name = search.trim();
    if (!name) return;
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const label = await run("create-label", () =>
      createLabel({ boardId, name, color }),
    );
    if (label) {
      setLabels((l) => [...l, label]);
      commit([...selectedIds, label.id]);
      setSearch("");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-auto min-h-7 w-full flex-wrap justify-start gap-1 py-1"
          />
        }
      >
        <Pending
          isPending={isPending}
          spinner="inline"
          className="flex w-full flex-wrap items-center gap-1"
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Tag className="size-3" /> Add labels
            </span>
          ) : (
            selected.map((l) => (
              <Badge
                key={l.id}
                style={{ backgroundColor: l.color, color: "white" }}
                className="border-none text-[10px]"
              >
                {l.name}
              </Badge>
            ))
          )}
        </Pending>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search or create…"
          />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {filtered.map((l) => {
                const isSelected = selectedIds.includes(l.id);
                return (
                  <CommandItem
                    key={l.id}
                    onSelect={() => toggle(l.id)}
                    className="cursor-pointer"
                  >
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: l.color }}
                    />
                    <span className="flex-1">{l.name}</span>
                    {isSelected && <Check className="size-3.5" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {canCreate && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={createNew} className="cursor-pointer">
                    <Plus className="size-3.5" />
                    Create label &ldquo;{search.trim()}&rdquo;
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
