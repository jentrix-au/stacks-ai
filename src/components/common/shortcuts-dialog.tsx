"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: Array<[string, string]> = [
  ["⌘ K", "Open command palette"],
  ["C", "Create a new task"],
  ["?", "Show this dialog"],
  ["Esc", "Close panels and dialogs"],
  ["Space", "Pick up a card while focused (DnD)"],
  ["Arrows", "Move a card after picking up"],
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            All shortcuts available on the board view.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-1 gap-y-2">
          {SHORTCUTS.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <kbd className="border-border bg-muted rounded border px-1.5 py-0.5 font-mono text-[11px]">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
