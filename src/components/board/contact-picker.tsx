"use client";

import { useState } from "react";
import { Check, Plus, User, X } from "lucide-react";

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
import { Pending, useSyncedTransition } from "@/components/sync";

import { setDealContacts } from "@/server/actions/deals";
import { createContact } from "@/server/actions/contacts";

export type ContactSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
};

export function ContactPicker({
  taskId,
  workspaceId,
  selected,
  initialContacts,
  onChange,
}: {
  taskId: string;
  workspaceId: string;
  selected: ContactSummary[];
  initialContacts: ContactSummary[];
  onChange: (next: ContactSummary[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactSummary[]>(initialContacts);
  const [search, setSearch] = useState("");
  const { isPending, run } = useSyncedTransition();

  const selectedIds = new Set(selected.map((c) => c.id));
  const q = search.trim().toLowerCase();
  const filtered = q
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.company && c.company.toLowerCase().includes(q)),
      )
    : contacts;
  const canCreate =
    q.length > 0 && !contacts.some((c) => c.name.toLowerCase() === q);

  function persist(next: ContactSummary[]) {
    onChange(next);
    run("set-deal-contacts", () =>
      setDealContacts({
        taskId,
        contactIds: next.map((c) => c.id),
      }),
    );
  }

  function toggle(contact: ContactSummary) {
    const isSelected = selectedIds.has(contact.id);
    const next = isSelected
      ? selected.filter((c) => c.id !== contact.id)
      : [...selected, contact];
    persist(next);
    setSearch("");
  }

  function removeOne(contactId: string) {
    persist(selected.filter((c) => c.id !== contactId));
  }

  async function createNew() {
    const name = search.trim();
    if (!name) return;
    const result = await run("create-contact", () =>
      createContact({ workspaceId, name }),
    );
    if (!result) return;
    const created: ContactSummary = {
      id: result.id,
      name,
      email: null,
      phone: null,
      company: null,
    };
    setContacts((cs) => [created, ...cs]);
    const next = [...selected, created];
    persist(next);
    setSearch("");
  }

  return (
    <Pending
      isPending={isPending}
      className="flex flex-wrap items-center gap-1"
    >
      {selected.map((c) => (
        <span
          key={c.id}
          className="border-border bg-card inline-flex items-center gap-1 rounded-md border py-0.5 pr-0.5 pl-2 text-xs"
        >
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-foreground font-medium">{c.name}</span>
            {(c.company || c.email) && (
              <span className="text-muted-foreground text-[10px]">
                {[c.company, c.email].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${c.name}`}
            onClick={() => removeOne(c.id)}
          >
            <X className="size-3" />
          </Button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground h-7 gap-1.5"
            />
          }
        >
          <User className="size-3" />
          {selected.length === 0 ? "Add contact" : "Add"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search or create…"
            />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {filtered.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <CommandItem
                      key={c.id}
                      onSelect={() => toggle(c)}
                      className="cursor-pointer"
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{c.name}</span>
                        {(c.company || c.email) && (
                          <span className="text-muted-foreground truncate text-[10px]">
                            {[c.company, c.email].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="size-3.5" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {canCreate && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={createNew}
                      className="cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      Create contact &ldquo;{search.trim()}&rdquo;
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Pending>
  );
}
