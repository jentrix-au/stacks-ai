"use client";

import { useState } from "react";
import { Check, UserPlus } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pending, useSyncedTransition } from "@/components/sync";
import { setTaskAssignees } from "@/server/actions/tasks";
import type { WorkspaceMember } from "./board-client";

type Assignee = WorkspaceMember;

export function AssigneeEditor({
  taskId,
  members,
  assignedIds: initialAssigned,
  onChange,
}: {
  taskId: string;
  members: WorkspaceMember[];
  assignedIds: string[];
  onChange: (next: Assignee[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [assignedIds, setAssignedIds] = useState<string[]>(initialAssigned);
  const { isPending, run } = useSyncedTransition();

  const assigned = members.filter((m) => assignedIds.includes(m.id));

  function commit(next: string[]) {
    const prev = assignedIds;
    setAssignedIds(next);
    onChange(members.filter((m) => next.includes(m.id)));
    run("set-assignees", () =>
      setTaskAssignees({ taskId, userIds: next }),
    ).then((result) => {
      if (result === null) {
        setAssignedIds(prev);
        onChange(members.filter((m) => prev.includes(m.id)));
      }
    });
  }

  function toggle(id: string) {
    commit(
      assignedIds.includes(id)
        ? assignedIds.filter((x) => x !== id)
        : [...assignedIds, id],
    );
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
          {assigned.length === 0 ? (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <UserPlus className="size-3" /> Assign
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <div className="flex -space-x-1">
                {assigned.slice(0, 4).map((m) => (
                  <Avatar key={m.id} className="ring-background size-5 ring-2">
                    {m.image && <AvatarImage src={m.image} alt="" />}
                    <AvatarFallback className="text-[9px]">
                      {(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              {assigned.length > 4 && (
                <span className="text-muted-foreground text-[11px]">
                  +{assigned.length - 4}
                </span>
              )}
              <span className="ml-1 truncate text-xs">
                {assigned.length === 1
                  ? (assigned[0].name ?? assigned[0].email)
                  : `${assigned.length} people`}
              </span>
            </div>
          )}
        </Pending>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search members…" />
          <CommandList>
            <CommandEmpty>No members found.</CommandEmpty>
            <CommandGroup>
              {members.map((m) => {
                const isSelected = assignedIds.includes(m.id);
                return (
                  <CommandItem
                    key={m.id}
                    value={m.name ?? m.email ?? m.id}
                    onSelect={() => toggle(m.id)}
                    className="cursor-pointer"
                  >
                    <Avatar className="size-5">
                      {m.image && <AvatarImage src={m.image} alt="" />}
                      <AvatarFallback className="text-[9px]">
                        {(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm">{m.name ?? m.email}</span>
                      {m.name && (
                        <span className="text-muted-foreground text-[11px]">
                          {m.email}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="size-3.5" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
