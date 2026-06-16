"use client";

import {
  useQueryStates,
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
} from "nuqs";
import { Priority } from "@/lib/enums";
import { ArrowUpDown, Tag, UserPlus, Flag, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PriorityDot } from "./priority-dot";
import type { FullBoard, FullTask } from "@/server/queries/boards";
import type { WorkspaceMember } from "./board-client";

type Board = NonNullable<FullBoard>;

const PRIORITY_VALUES = Object.values(Priority) as Priority[];

export type SortKey = "priority" | "due" | "newest";

const filterParsers = {
  labels: parseAsArrayOf(parseAsString).withDefault([]),
  assignees: parseAsArrayOf(parseAsString).withDefault([]),
  priorities: parseAsArrayOf(parseAsStringEnum(PRIORITY_VALUES)).withDefault(
    [],
  ),
  due: parseAsStringEnum(["overdue", "today", "week"]),
  sort: parseAsStringEnum<SortKey>(["priority", "due", "newest"]),
};

export type BoardFilterState = {
  labels: string[];
  assignees: string[];
  priorities: Priority[];
  due: "overdue" | "today" | "week" | null;
  sort: SortKey | null;
};

export function useBoardFilters() {
  const [filters, setFilters] = useQueryStates(filterParsers, {
    history: "replace",
  });
  function clearAll() {
    setFilters({
      labels: [],
      assignees: [],
      priorities: [],
      due: null,
      sort: null,
    });
  }
  function isActive() {
    return (
      filters.labels.length +
        filters.assignees.length +
        filters.priorities.length >
        0 ||
      !!filters.due ||
      !!filters.sort
    );
  }
  return { filters, setFilters, clearAll, isActive };
}

const PRIORITY_RANK: Record<Priority, number> = {
  [Priority.URGENT]: 0,
  [Priority.HIGH]: 1,
  [Priority.MEDIUM]: 2,
  [Priority.LOW]: 3,
};

/** View-time ordering within a column. null = manual (fractional positions). */
export function sortTasks(tasks: FullTask[], sort: SortKey | null): FullTask[] {
  if (!sort) return tasks;
  const arr = [...tasks];
  if (sort === "priority") {
    arr.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  } else if (sort === "due") {
    arr.sort(
      (a, b) =>
        (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) -
        (b.dueAt ? new Date(b.dueAt).getTime() : Infinity),
    );
  } else if (sort === "newest") {
    arr.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  return arr;
}

export function filterTasks(
  tasks: FullTask[],
  filters: ReturnType<typeof useBoardFilters>["filters"],
): FullTask[] {
  return tasks.filter((t) => {
    if (filters.labels.length > 0) {
      const ids = new Set(t.labels.map((l) => l.label.id));
      if (!filters.labels.some((id) => ids.has(id))) return false;
    }
    if (filters.assignees.length > 0) {
      const ids = new Set(t.assignees.map((a) => a.user.id));
      if (!filters.assignees.some((id) => ids.has(id))) return false;
    }
    if (filters.priorities.length > 0) {
      if (!filters.priorities.includes(t.priority)) return false;
    }
    if (filters.due) {
      if (!t.dueAt) return false;
      const due = new Date(t.dueAt);
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const inAWeek = new Date(now);
      inAWeek.setDate(now.getDate() + 7);
      if (filters.due === "overdue" && due >= now) return false;
      if (filters.due === "today") {
        const d = due.toDateString();
        if (d !== now.toDateString()) return false;
      }
      if (filters.due === "week" && due > inAWeek) return false;
    }
    return true;
  });
}

export function BoardFilters({
  labels,
  members,
}: {
  labels: Board["labels"];
  members: WorkspaceMember[];
}) {
  const { filters, setFilters, clearAll, isActive } = useBoardFilters();

  function toggle<K extends keyof typeof filters>(key: K, value: string) {
    const current = (filters[key] as unknown as string[] | null) ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFilters({ [key]: next } as Partial<typeof filters>);
  }

  const active = isActive();

  return (
    <div className="flex items-center gap-1.5">
      <LabelsFilter
        labels={labels}
        selected={filters.labels}
        onToggle={(id) => toggle("labels", id)}
      />
      <AssigneesFilter
        members={members}
        selected={filters.assignees}
        onToggle={(id) => toggle("assignees", id)}
      />
      <PriorityFilter
        selected={filters.priorities}
        onToggle={(p) => toggle("priorities", p)}
      />
      <DueFilter
        selected={filters.due}
        onChange={(v) => setFilters({ due: v })}
      />
      <SortControl
        selected={filters.sort}
        onChange={(v) => setFilters({ sort: v })}
      />
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="text-muted-foreground"
        >
          <X className="size-3" />
          Clear
        </Button>
      )}
    </div>
  );
}

function LabelsFilter({
  labels,
  selected,
  onToggle,
}: {
  labels: Board["labels"];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Tag className="size-3" />
            Labels
            {selected.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {selected.length}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Filter labels…" />
          <CommandList>
            <CommandGroup>
              {labels.map((l) => (
                <CommandItem
                  key={l.id}
                  value={l.name}
                  onSelect={() => onToggle(l.id)}
                  className="cursor-pointer"
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="flex-1">{l.name}</span>
                  {selected.includes(l.id) && (
                    <span className="text-primary text-[10px]">●</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AssigneesFilter({
  members,
  selected,
  onToggle,
}: {
  members: WorkspaceMember[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5">
            <UserPlus className="size-3" />
            Assignee
            {selected.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {selected.length}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Filter members…" />
          <CommandList>
            <CommandGroup>
              {members.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.name ?? m.email ?? m.id}
                  onSelect={() => onToggle(m.id)}
                  className="cursor-pointer"
                >
                  <Avatar className="size-5">
                    {m.image && <AvatarImage src={m.image} alt="" />}
                    <AvatarFallback className="text-[9px]">
                      {(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{m.name ?? m.email}</span>
                  {selected.includes(m.id) && (
                    <span className="text-primary text-[10px]">●</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PriorityFilter({
  selected,
  onToggle,
}: {
  selected: Priority[];
  onToggle: (p: Priority) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Flag className="size-3" />
            Priority
            {selected.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {selected.length}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-44 p-0">
        <Command>
          <CommandList>
            <CommandGroup>
              {PRIORITY_VALUES.map((p) => (
                <CommandItem
                  key={p}
                  value={p}
                  onSelect={() => onToggle(p)}
                  className="cursor-pointer"
                >
                  <PriorityDot priority={p} />
                  <span className="flex-1">
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                  </span>
                  {selected.includes(p) && (
                    <span className="text-primary text-[10px]">●</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SortControl({
  selected,
  onChange,
}: {
  selected: SortKey | null;
  onChange: (v: SortKey | null) => void;
}) {
  const LABELS: Record<SortKey, string> = {
    priority: "Priority",
    due: "Due date",
    newest: "Newest",
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowUpDown className="size-3" />
            {selected ? `Sort: ${LABELS[selected]}` : "Sort"}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-44 p-0">
        <Command>
          <CommandList>
            <CommandGroup>
              {(Object.keys(LABELS) as SortKey[]).map((v) => (
                <CommandItem
                  key={v}
                  value={v}
                  onSelect={() => onChange(v === selected ? null : v)}
                  className="cursor-pointer"
                >
                  {LABELS[v]}
                  {selected === v && (
                    <span className="text-primary ml-auto text-[10px]">●</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => onChange(null)}
                className="text-muted-foreground cursor-pointer"
              >
                Manual order
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DueFilter({
  selected,
  onChange,
}: {
  selected: "overdue" | "today" | "week" | null;
  onChange: (v: "overdue" | "today" | "week" | null) => void;
}) {
  const LABELS = {
    overdue: "Overdue",
    today: "Due today",
    week: "Due this week",
  } as const;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5">
            {selected ? LABELS[selected] : "Due date"}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-44 p-0">
        <Command>
          <CommandList>
            <CommandGroup>
              {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map((v) => (
                <CommandItem
                  key={v}
                  value={v}
                  onSelect={() => onChange(v === selected ? null : v)}
                  className="cursor-pointer"
                >
                  {LABELS[v]}
                  {selected === v && (
                    <span className="text-primary ml-auto text-[10px]">●</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => onChange(null)}
                className="text-muted-foreground cursor-pointer"
              >
                Clear filter
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
