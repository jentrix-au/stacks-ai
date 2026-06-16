"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: Workspace;
  workspaces: Workspace[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="-ml-1 max-w-[200px] justify-between gap-1.5"
            aria-label="Switch workspace"
          />
        }
      >
        <span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold uppercase">
          {current.name.charAt(0)}
        </span>
        <span className="truncate text-sm font-medium">{current.name}</span>
        <ChevronsUpDown className="text-muted-foreground size-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Find workspace…" />
          <CommandList>
            <CommandEmpty>No workspaces found.</CommandEmpty>
            <CommandGroup heading="Workspaces">
              {workspaces.map((w) => (
                <CommandItem
                  key={w.id}
                  value={w.name}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/${w.slug}`);
                  }}
                >
                  <span className="bg-muted flex size-5 items-center justify-center rounded-md text-[10px] font-semibold uppercase">
                    {w.name.charAt(0)}
                  </span>
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === current.id && (
                    <Check className="text-muted-foreground size-3.5" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  router.push("/onboarding/new-workspace");
                }}
              >
                <Plus className="size-3.5" />
                Create workspace
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
