"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSyncedTransition } from "@/components/sync";
import { createBoard } from "@/server/actions/boards";
import { BoardKind } from "@/lib/enums";

const KIND_OPTIONS: { value: BoardKind; label: string; hint: string }[] = [
  {
    value: BoardKind.TASKS,
    label: "Tasks",
    hint: "General Kanban: Backlog → In progress → In review → Done",
  },
  {
    value: BoardKind.CRM,
    label: "CRM",
    hint: "Sales pipeline: Lead → Qualified → Proposal → Negotiation → Won/Lost",
  },
  {
    value: BoardKind.SUPPORT,
    label: "Support",
    hint: "Customer tickets: New → Open → Waiting on customer → Resolved → Closed",
  },
  {
    value: BoardKind.BUGS,
    label: "Bugs",
    hint: "Issue tracker: Triage → Open → In progress → Fixed → Verified → Closed",
  },
  {
    value: BoardKind.ROADMAP,
    label: "Roadmap",
    hint: "Initiatives & epics: Discovery → In design → In build → Shipped → Won't do",
  },
];

export function CreateBoardDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<BoardKind>(BoardKind.TASKS);
  const { isPending, run } = useSyncedTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("workspaceId", workspaceId);
    formData.set("kind", kind);
    const ok = await run("create-board", () => createBoard(formData));
    if (ok !== null) setOpen(false);
  }

  const selectedHint = KIND_OPTIONS.find((o) => o.value === kind)?.hint;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-3.5" />
            New board
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create board</DialogTitle>
          <DialogDescription>
            Boards organize work into columns and tasks. Pick a kind to get a
            default column set.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="board-name">Board name</Label>
            <Input
              id="board-name"
              name="name"
              autoFocus
              required
              maxLength={80}
              placeholder="Product roadmap"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="board-kind">Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as BoardKind)}>
              <SelectTrigger id="board-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedHint && (
              <p className="text-muted-foreground text-xs">{selectedHint}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isPending} loadingText="Creating…">
              Create board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
