"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

/**
 * Makes the entire column body a drop target so a task can be dropped into
 * an empty column (where there's no sortable card under the cursor).
 */
export function ColumnDropZone({
  columnId,
  children,
}: {
  columnId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: { type: "column-body" },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[120px] flex-1 transition-colors",
        isOver && "bg-primary/5",
      )}
    >
      {children}
    </div>
  );
}
