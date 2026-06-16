"use client";

import { Archive, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Priority } from "@/lib/enums";
import type { WorkspaceMember } from "./board-client";

const selectCls =
  "border-input bg-background h-7 rounded-md border px-1.5 text-xs";

/**
 * Floating toolbar for the board multi-select (P3.8). Each select applies
 * immediately and resets — pick, done.
 */
export function BulkActionBar({
  count,
  columns,
  labels,
  members,
  busy,
  onMove,
  onPriority,
  onAddLabel,
  onAssign,
  onArchive,
  onClear,
}: {
  count: number;
  columns: { id: string; name: string }[];
  labels: { id: string; name: string }[];
  members: WorkspaceMember[];
  busy: boolean;
  onMove: (columnId: string) => void;
  onPriority: (priority: Priority) => void;
  onAddLabel: (labelId: string) => void;
  onAssign: (userId: string) => void;
  onArchive: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      data-testid="bulk-action-bar"
      className="border-border bg-card fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl border px-3 py-2 shadow-lg"
    >
      <span className="text-sm font-medium whitespace-nowrap">
        {count} selected
      </span>

      <select
        aria-label="Move selected to column"
        className={selectCls}
        value=""
        disabled={busy}
        onChange={(e) => e.target.value && onMove(e.target.value)}
      >
        <option value="">Move to…</option>
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Set priority for selected"
        className={selectCls}
        value=""
        disabled={busy}
        onChange={(e) =>
          e.target.value && onPriority(e.target.value as Priority)
        }
      >
        <option value="">Priority…</option>
        {Object.values(Priority).map((p) => (
          <option key={p} value={p}>
            {p.charAt(0) + p.slice(1).toLowerCase()}
          </option>
        ))}
      </select>

      {labels.length > 0 && (
        <select
          aria-label="Add label to selected"
          className={selectCls}
          value=""
          disabled={busy}
          onChange={(e) => e.target.value && onAddLabel(e.target.value)}
        >
          <option value="">Label…</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}

      <select
        aria-label="Assign selected to member"
        className={selectCls}
        value=""
        disabled={busy}
        onChange={(e) => e.target.value && onAssign(e.target.value)}
      >
        <option value="">Assign…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name ?? m.email}
          </option>
        ))}
      </select>

      <Button
        size="sm"
        variant="ghost"
        className="text-destructive gap-1"
        disabled={busy}
        onClick={onArchive}
      >
        <Archive className="size-3.5" />
        Archive
      </Button>

      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Clear selection"
        onClick={onClear}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
