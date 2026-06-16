"use client";

import { useState } from "react";
import {
  Archive,
  GitMerge,
  Loader2,
  Mail,
  Phone,
  Plus,
  Building2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSyncedTransition } from "@/components/sync";
import { cn } from "@/lib/utils";
import {
  archiveContact,
  createContact,
  mergeContacts,
  updateContact,
} from "@/server/actions/contacts";

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  dealCount: number;
  ticketCount: number;
  archivedAt: Date | null;
};

export function ContactsList({
  workspaceId,
  contacts: initialContacts,
}: {
  workspaceId: string;
  contacts: Row[];
}) {
  const [contacts, setContacts] = useState<Row[]>(initialContacts);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [merging, setMerging] = useState<Row | null>(null);
  const [recentId, setRecentId] = useState<string | null>(null);

  const q = filter.trim().toLowerCase();
  const visible = q
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.company && c.company.toLowerCase().includes(q)),
      )
    : contacts;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by name, email, company…"
          className="max-w-sm"
        />
        <ContactFormDialog
          workspaceId={workspaceId}
          mode="create"
          onSaved={(c) => {
            setContacts((cs) => [c, ...cs]);
            setRecentId(c.id);
            setTimeout(() => setRecentId(null), 700);
          }}
        />
      </div>
      {visible.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed px-6 py-16 text-center text-sm">
          No people yet. Create one to get started, or add a contact to a deal
          on a CRM board or a ticket on a Support board.
        </div>
      ) : (
        <ul className="divide-border border-border divide-y overflow-hidden rounded-xl border">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((c) => (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  height: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                }}
                transition={{ duration: 0.2 }}
                className={cn(c.id === recentId && "animate-saved-pulse-bg")}
              >
                <ContactRow
                  contact={c}
                  workspaceId={workspaceId}
                  onEdit={() => setEditing(c)}
                  onMerge={() => setMerging(c)}
                  onArchived={() =>
                    setContacts((cs) => cs.filter((x) => x.id !== c.id))
                  }
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {merging && (
        <MergeContactDialog
          survivor={merging}
          candidates={contacts.filter((c) => c.id !== merging.id)}
          onClose={() => setMerging(null)}
          onMerged={(duplicateId) => {
            const dup = contacts.find((c) => c.id === duplicateId);
            setContacts((cs) =>
              cs
                .filter((x) => x.id !== duplicateId)
                .map((x) =>
                  x.id === merging.id && dup
                    ? {
                        ...x,
                        email: x.email ?? dup.email,
                        phone: x.phone ?? dup.phone,
                        company: x.company ?? dup.company,
                        dealCount: x.dealCount + dup.dealCount,
                        ticketCount: x.ticketCount + dup.ticketCount,
                      }
                    : x,
                ),
            );
            setRecentId(merging.id);
            setTimeout(() => setRecentId(null), 700);
            setMerging(null);
          }}
        />
      )}

      {editing && (
        <ContactFormDialog
          workspaceId={workspaceId}
          mode="edit"
          initial={editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          onSaved={(c) => {
            setContacts((cs) =>
              cs.map((x) => (x.id === c.id ? { ...x, ...c } : x)),
            );
            setRecentId(c.id);
            setTimeout(() => setRecentId(null), 700);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ContactRow({
  contact,
  onEdit,
  onMerge,
  onArchived,
}: {
  contact: Row;
  workspaceId: string;
  onEdit: () => void;
  onMerge: () => void;
  onArchived: () => void;
}) {
  const { isPending, run } = useSyncedTransition();
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3 transition-opacity",
        isPending && "pointer-events-none opacity-60",
      )}
      aria-busy={isPending || undefined}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{contact.name}</span>
          {contact.dealCount > 0 && (
            <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">
              {contact.dealCount} deal{contact.dealCount === 1 ? "" : "s"}
            </span>
          )}
          {contact.ticketCount > 0 && (
            <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">
              {contact.ticketCount} ticket{contact.ticketCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {contact.company && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3" />
              {contact.company}
            </span>
          )}
          {contact.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="size-3" />
              {contact.email}
            </span>
          )}
          {contact.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3" />
              {contact.phone}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Merge a duplicate into ${contact.name}`}
          onClick={onMerge}
        >
          <GitMerge className="size-3" />
          Merge
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => {
            if (
              !confirm(
                "Archive this contact? Existing deal and ticket links are preserved.",
              )
            )
              return;
            run("archive-contact", () =>
              archiveContact({ contactId: contact.id }),
            ).then((ok) => {
              if (ok !== null) onArchived();
            });
          }}
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Archive className="size-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Duplicate-people merge (P3.9): the picked duplicate's deals/tickets move
 * to the survivor in one transaction and the duplicate is deleted.
 */
function MergeContactDialog({
  survivor,
  candidates,
  onClose,
  onMerged,
}: {
  survivor: Row;
  candidates: Row[];
  onClose: () => void;
  onMerged: (duplicateId: string) => void;
}) {
  const [duplicateId, setDuplicateId] = useState("");
  const { isPending, run } = useSyncedTransition();
  const duplicate = candidates.find((c) => c.id === duplicateId);

  async function merge() {
    if (!duplicate) return;
    const ok = await run("merge-contacts", () =>
      mergeContacts({ survivorId: survivor.id, duplicateId: duplicate.id }),
    );
    if (ok === null) return;
    onMerged(duplicate.id);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge into {survivor.name}</DialogTitle>
          <DialogDescription>
            The selected duplicate&rsquo;s deals and tickets move to{" "}
            {survivor.name}, empty fields are filled in, and the duplicate is
            deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="merge-duplicate">Duplicate to fold in</Label>
          <select
            id="merge-duplicate"
            className="border-input bg-transparent h-9 rounded-md border px-2 text-sm"
            value={duplicateId}
            onChange={(e) => setDuplicateId(e.target.value)}
          >
            <option value="">Choose a person…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.email ? ` <${c.email}>` : ""}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!duplicate}
            loading={isPending}
            loadingText="Merging…"
            onClick={merge}
          >
            Merge contacts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ContactFormDialogProps =
  | {
      workspaceId: string;
      mode: "create";
      initial?: undefined;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
      onSaved: (c: Row) => void;
    }
  | {
      workspaceId: string;
      mode: "edit";
      initial: Row;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onSaved: (c: Row) => void;
    };

function ContactFormDialog(props: ContactFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = props.open !== undefined;
  const open = isControlled ? props.open! : internalOpen;
  const setOpen = isControlled
    ? (props.onOpenChange ?? (() => {}))
    : setInternalOpen;

  const { isPending, run } = useSyncedTransition();

  async function handleSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const email = String(formData.get("email") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const company = String(formData.get("company") ?? "").trim() || null;

    if (props.mode === "create") {
      const result = await run("create-contact", () =>
        createContact({
          workspaceId: props.workspaceId,
          name,
          email,
          phone,
          company,
        }),
      );
      if (!result) return;
      props.onSaved({
        id: result.id,
        name,
        email,
        phone,
        company,
        dealCount: 0,
        ticketCount: 0,
        archivedAt: null,
      });
    } else {
      const ok = await run("update-contact", () =>
        updateContact({
          contactId: props.initial.id,
          name,
          email,
          phone,
          company,
        }),
      );
      if (ok === null) return;
      props.onSaved({
        ...props.initial,
        name,
        email,
        phone,
        company,
      });
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {props.mode === "create" && !isControlled && (
        <DialogTrigger
          render={
            <Button size="sm">
              <Plus className="size-3.5" />
              New contact
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {props.mode === "create" ? "New contact" : "Edit contact"}
          </DialogTitle>
          <DialogDescription>
            People are shared across all CRM and Support boards in this
            workspace.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <fieldset disabled={isPending} className="contents">
            <div className="grid gap-2">
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                name="name"
                autoFocus
                required
                maxLength={120}
                defaultValue={props.initial?.name ?? ""}
                placeholder="Jane Doe"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-company">Company</Label>
              <Input
                id="contact-company"
                name="company"
                maxLength={120}
                defaultValue={props.initial?.company ?? ""}
                placeholder="Acme Corp"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                name="email"
                type="email"
                maxLength={255}
                defaultValue={props.initial?.email ?? ""}
                placeholder="jane@acme.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                name="phone"
                maxLength={40}
                defaultValue={props.initial?.phone ?? ""}
                placeholder="+1 555 123 4567"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={isPending}
                loadingText={props.mode === "create" ? "Creating…" : "Saving…"}
              >
                {props.mode === "create" ? "Create contact" : "Save"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
