"use client";

import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSyncedTransition } from "@/components/sync";
import { cn } from "@/lib/utils";
import { TaskCard } from "./task-card";
import { ColumnDropZone } from "./column-drop-zone";
import { InlineTaskCreate } from "./inline-task-create";
import { archiveColumn } from "@/server/actions/columns";
import { BoardKind } from "@/lib/enums";
import type { FullColumn, FullTask } from "@/server/queries/boards";

export function Column({
  column,
  boardKind,
  taskKeyPrefix,
  isFirst = false,
  recentlyMovedTaskId = null,
  onOpenTask,
  selectedTaskIds,
  workspaceContacts,
  onTaskCreated,
  onArchived,
}: {
  column: FullColumn;
  boardKind: BoardKind;
  taskKeyPrefix: string;
  isFirst?: boolean;
  recentlyMovedTaskId?: string | null;
  onOpenTask: (taskId: string, shiftKey: boolean) => void;
  selectedTaskIds?: ReadonlySet<string>;
  workspaceContacts?: import("./board-client").WorkspaceContactSummary[];
  onTaskCreated: (task: FullTask) => void;
  onArchived: (columnId: string) => void;
}) {
  const { isPending: archivePending, run } = useSyncedTransition();
  const [recentlyCreatedId, setRecentlyCreatedId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!recentlyCreatedId) return;
    const t = setTimeout(() => setRecentlyCreatedId(null), 700);
    return () => clearTimeout(t);
  }, [recentlyCreatedId]);
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: "column" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : archivePending ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      aria-busy={archivePending || undefined}
      className={cn(
        "bg-muted/40 flex w-72 shrink-0 flex-col rounded-xl transition-opacity",
        archivePending && "pointer-events-none",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex h-9 cursor-grab items-center gap-2 px-3 active:cursor-grabbing"
      >
        <h2 className="text-muted-foreground flex-1 text-xs font-semibold tracking-wider uppercase">
          {column.name}
          <span className="text-muted-foreground/70 ml-1.5">
            {column.tasks.length}
          </span>
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Column options"
              />
            }
          >
            <MoreHorizontal className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                const fd = new FormData();
                fd.set("columnId", column.id);
                run("archive-column", () => archiveColumn(fd)).then((ok) => {
                  if (ok !== null) onArchived(column.id);
                });
              }}
            >
              Archive column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ColumnDropZone columnId={column.id}>
        <SortableContext
          items={column.tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-1.5 px-1.5 pb-1.5">
            <AnimatePresence initial={false}>
              {column.tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  boardKind={boardKind}
                  taskKeyPrefix={taskKeyPrefix}
                  onOpen={onOpenTask}
                  selected={selectedTaskIds?.has(t.id) ?? false}
                  highlightOnEnter={
                    t.id === recentlyCreatedId || t.id === recentlyMovedTaskId
                  }
                />
              ))}
            </AnimatePresence>
            {column.tasks.length === 0 && (
              <motion.li
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-muted-foreground rounded-md px-2 py-3 text-center text-xs"
              >
                Drop tasks here
              </motion.li>
            )}
          </ul>
        </SortableContext>
      </ColumnDropZone>

      <div className="border-border/40 border-t p-1.5">
        <InlineTaskCreate
          columnId={column.id}
          boardKind={boardKind}
          contacts={workspaceContacts}
          hotkeyTarget={isFirst}
          onCreated={(task) => {
            setRecentlyCreatedId(task.id);
            onTaskCreated(task);
          }}
        />
      </div>
    </div>
  );
}
