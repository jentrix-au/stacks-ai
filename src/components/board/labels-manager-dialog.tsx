"use client";

import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useSyncedTransition } from "@/components/sync";
import { createLabel, deleteLabel, updateLabel } from "@/server/actions/labels";
import { cn } from "@/lib/utils";

export type Label = {
  id: string;
  boardId: string;
  name: string;
  color: string;
};

const PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#94a3b8", // slate
  "#737373", // neutral
];

export function LabelsManagerDialog({
  open,
  onOpenChange,
  boardId,
  labels,
  onLabelCreated,
  onLabelUpdated,
  onLabelDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  boardId: string;
  labels: Label[];
  onLabelCreated: (label: Label) => void;
  onLabelUpdated: (label: Label) => void;
  onLabelDeleted: (labelId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Labels</DialogTitle>
          <DialogDescription>
            Reusable tags for the tasks on this board.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {labels.length === 0 ? (
              <motion.li
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="border-border text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs"
              >
                No labels yet. Add one below.
              </motion.li>
            ) : (
              labels.map((label) => (
                <motion.li
                  key={label.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <LabelRow
                    label={label}
                    onUpdated={onLabelUpdated}
                    onDeleted={onLabelDeleted}
                  />
                </motion.li>
              ))
            )}
          </AnimatePresence>
        </ul>

        <Separator />

        <CreateRow
          boardId={boardId}
          existing={labels}
          onCreated={onLabelCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

function LabelRow({
  label,
  onUpdated,
  onDeleted,
}: {
  label: Label;
  onUpdated: (label: Label) => void;
  onDeleted: (labelId: string) => void;
}) {
  const [name, setName] = useState(label.name);
  const { run } = useSyncedTransition();

  function saveName() {
    const next = name.trim();
    if (!next || next === label.name) {
      setName(label.name);
      return;
    }
    onUpdated({ ...label, name: next });
    run("update-label", () =>
      updateLabel({ labelId: label.id, name: next }),
    ).then((ok) => {
      if (ok === null) {
        setName(label.name);
        onUpdated(label);
      }
    });
  }

  function saveColor(color: string) {
    onUpdated({ ...label, color });
    run("update-label-color", () =>
      updateLabel({ labelId: label.id, color }),
    ).then((ok) => {
      if (ok === null) onUpdated(label);
    });
  }

  async function remove() {
    const ok = await run("delete-label", () =>
      deleteLabel({ labelId: label.id }),
    );
    if (ok !== null) {
      onDeleted(label.id);
      toast.success(`Removed "${label.name}"`);
    }
  }

  return (
    <div className="group hover:bg-muted/50 flex items-center gap-2 rounded-md px-1 py-1">
      <ColorSwatch value={label.color} onChange={saveColor} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setName(label.name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="focus-visible:bg-card h-7 flex-1 border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
      />
      <button
        type="button"
        onClick={remove}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={`Delete label ${label.name}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function ColorSwatch({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="ring-foreground/10 size-4 shrink-0 rounded-full ring-1 transition-transform ring-inset hover:scale-110"
            style={{ backgroundColor: value }}
            aria-label="Change color"
          />
        }
      />
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-9 gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={cn(
                "ring-foreground/10 size-5 rounded-full ring-1 transition-transform ring-inset hover:scale-110",
                value.toLowerCase() === c.toLowerCase() &&
                  "ring-offset-background ring-2 ring-offset-1",
              )}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            >
              {value.toLowerCase() === c.toLowerCase() && (
                <Check className="m-auto size-3 text-white drop-shadow" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CreateRow({
  boardId,
  existing,
  onCreated,
}: {
  boardId: string;
  existing: Label[];
  onCreated: (label: Label) => void;
}) {
  // Cycle through the palette by existing-label count so each new label
  // gets a visually distinct color, deterministically.
  const pickColor = (seed: number) => PALETTE[seed % PALETTE.length];
  const [name, setName] = useState("");
  const [color, setColor] = useState(() => pickColor(existing.length));
  const { isPending, run } = useSyncedTransition();

  async function submit() {
    const next = name.trim();
    if (!next) return;
    if (existing.some((l) => l.name.toLowerCase() === next.toLowerCase())) {
      toast.error("A label with that name already exists");
      return;
    }
    const label = await run("create-label", () =>
      createLabel({ boardId, name: next, color }),
    );
    if (label) {
      onCreated(label);
      setName("");
      setColor(pickColor(existing.length + 1));
    }
  }

  return (
    <div className="flex items-center gap-2">
      <ColorSwatch value={color} onChange={setColor} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="New label name"
        className="h-7 flex-1 text-sm"
      />
      <Button
        size="sm"
        onClick={submit}
        disabled={!name.trim()}
        loading={isPending}
        loadingText="Adding…"
      >
        <Plus className="size-3" />
        Add
      </Button>
    </div>
  );
}
