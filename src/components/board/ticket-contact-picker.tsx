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

import { linkTicketContact } from "@/server/actions/tickets";
import { createContact } from "@/server/actions/contacts";
import type { ContactSummary } from "./contact-picker";

/**
 * Single-select contact picker for SUPPORT tickets (one contact per ticket,
 * unlike the multi-contact deal picker). Searches and creates entries in the
 * shared workspace contact directory.
 */
export function TicketContactPicker({
  taskId,
  workspaceId,
  selected,
  initialContacts,
  onChange,
}: {
  taskId: string;
  workspaceId: string;
  selected: ContactSummary | null;
  initialContacts: ContactSummary[];
  onChange: (next: ContactSummary | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactSummary[]>(initialContacts);
  const [search, setSearch] = useState("");
  const { isPending, run } = useSyncedTransition();

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

  function pick(contact: ContactSummary | null) {
    onChange(contact);
    run("link-ticket-contact", () =>
      linkTicketContact({ taskId, contactId: contact?.id ?? null }),
    );
    setOpen(false);
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
    pick(created);
    setSearch("");
  }

  return (
    <Pending isPending={isPending} className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-h-7 max-w-full justify-start gap-1.5 py-1"
            />
          }
        >
          {selected ? (
            <span className="flex flex-col items-start text-xs leading-tight">
              <span className="text-foreground font-medium">
                {selected.name}
              </span>
              {(selected.company || selected.email) && (
                <span className="text-muted-foreground text-[10px]">
                  {[selected.company, selected.email]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <User className="size-3" /> Add contact
            </span>
          )}
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
                  const isSelected = selected?.id === c.id;
                  return (
                    <CommandItem
                      key={c.id}
                      onSelect={() => pick(c)}
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
      {selected && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Unlink contact"
          onClick={() => pick(null)}
        >
          <X className="size-3" />
        </Button>
      )}
    </Pending>
  );
}
