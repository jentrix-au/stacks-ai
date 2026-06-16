"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Link2, Plus, X } from "lucide-react";

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
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Pending, useSyncedTransition } from "@/components/sync";
import { TaskLinkKind } from "@/lib/enums";
import { addTaskLink, removeTaskLink } from "@/server/actions/task-links";

export type LinkTargetOption = {
  taskId: string;
  number: number;
  title: string;
  board: { id: string; name: string; slug: string; kind: string };
};

export type TaskLinkEdge = {
  kind: TaskLinkKind;
  taskId: string;
  number: number;
  title: string;
  board: { id: string; name: string; slug: string; kind: string };
};

const KIND_LABEL: Record<TaskLinkKind, string> = {
  BLOCKS: "Blocks",
  DEPENDS_ON: "Depends on",
  RELATES_TO: "Relates to",
  DUPLICATES: "Duplicates",
};

export function TaskLinkPicker({
  currentTaskId,
  taskKeyPrefix,
  outgoing,
  incoming,
  options,
  onAdded,
  onRemoved,
}: {
  currentTaskId: string;
  taskKeyPrefix: string;
  outgoing: TaskLinkEdge[];
  incoming: TaskLinkEdge[];
  options: LinkTargetOption[];
  onAdded: (edge: TaskLinkEdge) => void;
  onRemoved: (
    kind: TaskLinkKind,
    taskId: string,
    direction: "outgoing" | "incoming",
  ) => void;
}) {
  const [kind, setKind] = useState<TaskLinkKind>(TaskLinkKind.RELATES_TO);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { isPending, run } = useSyncedTransition();

  const eligible = options.filter((o) => o.taskId !== currentTaskId);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? eligible.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.board.name.toLowerCase().includes(q) ||
          `${taskKeyPrefix}-${o.number}`.toLowerCase().includes(q),
      )
    : eligible;

  async function pick(target: LinkTargetOption) {
    setOpen(false);
    setSearch("");
    const ok = await run("add-task-link", () =>
      addTaskLink({
        fromTaskId: currentTaskId,
        toTaskId: target.taskId,
        kind,
      }),
    );
    if (ok !== null) {
      onAdded({
        kind,
        taskId: target.taskId,
        number: target.number,
        title: target.title,
        board: target.board,
      });
    }
  }

  async function unlink(
    edge: TaskLinkEdge,
    direction: "outgoing" | "incoming",
  ) {
    const args =
      direction === "outgoing"
        ? {
            fromTaskId: currentTaskId,
            toTaskId: edge.taskId,
            kind: edge.kind,
          }
        : {
            fromTaskId: edge.taskId,
            toTaskId: currentTaskId,
            kind: edge.kind,
          };
    const ok = await run("remove-task-link", () => removeTaskLink(args));
    if (ok !== null) {
      onRemoved(edge.kind, edge.taskId, direction);
    }
  }

  return (
    <Pending isPending={isPending} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as TaskLinkKind)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue>
              {(value: string | null) =>
                value ? KIND_LABEL[value as TaskLinkKind] : null
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABEL) as TaskLinkKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="size-3" />
                Add link
              </Button>
            }
          />
          <PopoverContent align="start" className="w-80 p-0">
            <Command shouldFilter={false}>
              <CommandInput
                value={search}
                onValueChange={setSearch}
                placeholder="Search tasks…"
              />
              <CommandList>
                <CommandEmpty>No matches.</CommandEmpty>
                <CommandGroup>
                  {filtered.map((o) => (
                    <CommandItem
                      key={o.taskId}
                      onSelect={() => pick(o)}
                      className="cursor-pointer"
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">
                          <span className="text-muted-foreground mr-1.5 font-mono text-[10px]">
                            {taskKeyPrefix}-{o.number}
                          </span>
                          {o.title}
                        </span>
                        <span className="text-muted-foreground truncate text-[10px]">
                          {o.board.name}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <EdgeGroup
        label="Outgoing"
        icon={<ArrowDown className="size-3" />}
        edges={outgoing}
        taskKeyPrefix={taskKeyPrefix}
        onRemove={(e) => unlink(e, "outgoing")}
      />
      <EdgeGroup
        label="Incoming"
        icon={<ArrowUp className="size-3" />}
        edges={incoming}
        taskKeyPrefix={taskKeyPrefix}
        onRemove={(e) => unlink(e, "incoming")}
      />
    </Pending>
  );
}

function EdgeGroup({
  label,
  icon,
  edges,
  taskKeyPrefix,
  onRemove,
}: {
  label: string;
  icon: React.ReactNode;
  edges: TaskLinkEdge[];
  taskKeyPrefix: string;
  onRemove: (e: TaskLinkEdge) => void;
}) {
  if (edges.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px] font-medium tracking-wider uppercase">
        {icon}
        {label}
      </span>
      <ul className="flex flex-col gap-1">
        {edges.map((e) => (
          <li
            key={`${e.kind}-${e.taskId}`}
            className="border-border bg-card flex items-center gap-2 rounded border px-2 py-1 text-xs"
          >
            <Link2 className="text-muted-foreground size-3" />
            <span className="text-muted-foreground text-[10px] font-medium uppercase">
              {KIND_LABEL[e.kind]}
            </span>
            <span className="text-muted-foreground font-mono text-[10px]">
              {taskKeyPrefix}-{e.number}
            </span>
            <span className="truncate font-medium">{e.title}</span>
            <span className="text-muted-foreground ml-auto truncate text-[10px]">
              {e.board.name}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove link"
              onClick={() => onRemove(e)}
            >
              <X className="size-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
