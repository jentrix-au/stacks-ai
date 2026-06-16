"use client";

import { useEffect, useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import type { FullBoard } from "@/server/queries/boards";
import {
  archiveTask,
  bulkMoveTasks,
  bulkUpdateTasks,
  moveTask,
  setTaskAssignees,
  setTaskLabels,
} from "@/server/actions/tasks";
import { moveColumn } from "@/server/actions/columns";
import { BulkActionBar } from "./bulk-action-bar";
import type { Priority } from "@/lib/enums";
import { useBoardRealtime } from "@/hooks/use-board-realtime";
import { useSyncedTransition } from "@/components/sync";
import { BoardTopBar } from "./board-top-bar";
import { Column } from "./column";
import { CreateColumn } from "./create-column";
import { DragOverlayCard } from "./drag-overlay-card";
import { TaskDetailPanel } from "./task-detail-panel";
import { filterTasks, sortTasks, useBoardFilters } from "./board-filters";
import { applySidecarPatch } from "./realtime-patch";
import { ShortcutsDialog } from "@/components/common/shortcuts-dialog";
import type { SavedViewSummary } from "@/server/views/operations";

type Board = NonNullable<FullBoard>;
type ColumnT = Board["columns"][number];
type TaskT = ColumnT["tasks"][number];

export type WorkspaceMember = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type WorkspaceContactSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
};

export type WorkspaceLinkTargetSummary = {
  taskId: string;
  number: number;
  title: string;
  board: { id: string; name: string; slug: string; kind: string };
};

export function BoardClient({
  board: initialBoard,
  initialOpenTaskId = null,
  currentUserId,
  workspaceMembers,
  workspaceContacts,
  workspaceLinkTargets,
  savedViews = [],
}: {
  board: Board;
  initialOpenTaskId?: string | null;
  currentUserId: string;
  workspaceMembers: WorkspaceMember[];
  workspaceContacts: WorkspaceContactSummary[];
  workspaceLinkTargets: WorkspaceLinkTargetSummary[];
  savedViews?: SavedViewSummary[];
}) {
  const [board, setBoard] = useState<Board>(initialBoard);
  // Re-sync local state whenever the server re-renders with a fresh
  // `initialBoard` (after `router.refresh()` from realtime events, or
  // after a server action's `revalidatePath`). Without this, optimistic UI
  // keeps its first snapshot and remote/local mutations don't show up
  // until a full remount. Using the compare-during-render pattern instead
  // of useEffect avoids a cascading render.
  const [lastInitialBoard, setLastInitialBoard] = useState(initialBoard);
  if (lastInitialBoard !== initialBoard) {
    setLastInitialBoard(initialBoard);
    setBoard(initialBoard);
  }
  // Sidecar `*.updated` events patch local state in place (P3.9); anything
  // else falls back to the hook's router.refresh(). The handler is re-created
  // each render (the hook keeps it in a ref), so `board` is always current.
  useBoardRealtime(initialBoard.id, (event, payload) => {
    const next = applySidecarPatch(board, event, payload);
    if (!next) return false;
    setBoard(next);
    return true;
  });
  const { filters } = useBoardFilters();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"task" | "column" | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(
    initialOpenTaskId,
  );
  // Deep-link sync (?task=<id> from search/palette): re-open the panel when
  // only the search param changes on an already-mounted board. Same
  // compare-during-render pattern as the board re-sync above.
  const [lastInitialOpenTaskId, setLastInitialOpenTaskId] =
    useState(initialOpenTaskId);
  if (lastInitialOpenTaskId !== initialOpenTaskId) {
    setLastInitialOpenTaskId(initialOpenTaskId);
    if (initialOpenTaskId) setOpenTaskId(initialOpenTaskId);
  }
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [recentlyMovedTaskId, setRecentlyMovedTaskId] = useState<string | null>(
    null,
  );
  // Multi-select (P3.8): shift-click toggles; plain click opens + clears.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const { run } = useSyncedTransition();

  useEffect(() => {
    if (!recentlyMovedTaskId) return;
    const t = setTimeout(() => setRecentlyMovedTaskId(null), 700);
    return () => clearTimeout(t);
  }, [recentlyMovedTaskId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target?.matches("input, textarea, [contenteditable=true], select") ??
        false;
      if (inEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "c") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("stacks:new-task"));
      } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const columnIds = useMemo(
    () => board.columns.map((c) => c.id),
    [board.columns],
  );
  const allTasks = useMemo(
    () => board.columns.flatMap((c) => c.tasks),
    [board.columns],
  );

  const activeTask: TaskT | null = useMemo(() => {
    if (activeType !== "task" || !activeId) return null;
    return allTasks.find((t) => t.id === activeId) ?? null;
  }, [activeId, activeType, allTasks]);

  const activeColumn: ColumnT | null = useMemo(() => {
    if (activeType !== "column" || !activeId) return null;
    return board.columns.find((c) => c.id === activeId) ?? null;
  }, [activeId, activeType, board.columns]);

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const isColumn = columnIds.includes(id);
    setActiveId(id);
    setActiveType(isColumn ? "column" : "task");
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    setActiveType(null);
    const { active, over } = e;
    if (!over) return;
    if (active.id === over.id) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // ---- Column reorder ----
    if (columnIds.includes(activeIdStr) && columnIds.includes(overIdStr)) {
      const oldIndex = columnIds.indexOf(activeIdStr);
      const newIndex = columnIds.indexOf(overIdStr);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...board.columns];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setBoard({ ...board, columns: reordered });

      const before = reordered[newIndex - 1]?.id ?? null;
      const after = reordered[newIndex + 1]?.id ?? null;
      run("move-column", () =>
        moveColumn({
          columnId: activeIdStr,
          beforeColumnId: before,
          afterColumnId: after,
        }),
      ).then((ok) => {
        if (ok === null) setBoard(initialBoard);
      });
      return;
    }

    // ---- Task move (within column or across) ----
    const fromColumn = board.columns.find((c) =>
      c.tasks.some((t) => t.id === activeIdStr),
    );
    if (!fromColumn) return;

    // While a sort is applied, the visible order is a view-time transform —
    // same-column drags would persist misleading positions, so ignore them.
    // Cross-column drops still change the column (appended at the end).
    if (filters.sort) {
      const overIsColumn = columnIds.includes(overIdStr);
      const overColumn = overIsColumn
        ? board.columns.find((c) => c.id === overIdStr)
        : board.columns.find((c) => c.tasks.some((t) => t.id === overIdStr));
      if (!overColumn || overColumn.id === fromColumn.id) return;
      run("move-task", () =>
        moveTask({
          taskId: activeIdStr,
          toColumnId: overColumn.id,
          beforeTaskId: overColumn.tasks[overColumn.tasks.length - 1]?.id ?? null,
          afterTaskId: null,
        }),
      ).then((ok) => {
        if (ok !== null) setRecentlyMovedTaskId(activeIdStr);
      });
      return;
    }

    // `over.id` is either a task id or a column id (when dropped on empty space).
    const toColumn = columnIds.includes(overIdStr)
      ? board.columns.find((c) => c.id === overIdStr)
      : board.columns.find((c) => c.tasks.some((t) => t.id === overIdStr));
    if (!toColumn) return;

    const next = board.columns.map((c) => ({ ...c, tasks: [...c.tasks] }));
    const fromCol = next.find((c) => c.id === fromColumn.id)!;
    const toCol = next.find((c) => c.id === toColumn.id)!;
    const taskIndex = fromCol.tasks.findIndex((t) => t.id === activeIdStr);
    const [task] = fromCol.tasks.splice(taskIndex, 1);

    let insertAt: number;
    if (columnIds.includes(overIdStr)) {
      // Dropped on an empty column.
      insertAt = toCol.tasks.length;
    } else {
      insertAt = toCol.tasks.findIndex((t) => t.id === overIdStr);
      if (insertAt === -1) insertAt = toCol.tasks.length;
    }
    toCol.tasks.splice(insertAt, 0, task);
    setBoard({ ...board, columns: next });

    const before = toCol.tasks[insertAt - 1]?.id ?? null;
    const after = toCol.tasks[insertAt + 1]?.id ?? null;
    run("move-task", () =>
      moveTask({
        taskId: activeIdStr,
        toColumnId: toCol.id,
        beforeTaskId: before,
        afterTaskId: after,
      }),
    ).then((ok) => {
      if (ok === null) {
        setBoard(initialBoard);
      } else {
        setRecentlyMovedTaskId(activeIdStr);
      }
    });
  }

  function patchBoardWithTask(updated: Partial<TaskT> & { id: string }) {
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) => ({
        ...c,
        tasks: c.tasks.map((t) =>
          t.id === updated.id ? { ...t, ...updated } : t,
        ),
      })),
    }));
  }

  const openTask: TaskT | null = useMemo(
    () => allTasks.find((t) => t.id === openTaskId) ?? null,
    [allTasks, openTaskId],
  );

  function handleOpenTask(taskId: string, shiftKey: boolean) {
    if (shiftKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
        return next;
      });
      return;
    }
    setSelectedIds(new Set());
    setOpenTaskId(taskId);
  }

  function removeTasksLocally(ids: ReadonlySet<string>) {
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) => ({
        ...c,
        tasks: c.tasks.filter((t) => !ids.has(t.id)),
      })),
    }));
  }

  async function runBulk(key: string, fn: () => Promise<unknown>) {
    setBulkBusy(true);
    try {
      await run(key, fn);
    } finally {
      setBulkBusy(false);
      setSelectedIds(new Set());
    }
  }

  function bulkMove(toColumnId: string) {
    const ids = [...selectedIds];
    // Optimistic: move the cards to the end of the target column.
    setBoard((b) => {
      const moving = b.columns.flatMap((c) =>
        c.tasks.filter((t) => selectedIds.has(t.id)),
      );
      return {
        ...b,
        columns: b.columns.map((c) => ({
          ...c,
          tasks:
            c.id === toColumnId
              ? [...c.tasks.filter((t) => !selectedIds.has(t.id)), ...moving]
              : c.tasks.filter((t) => !selectedIds.has(t.id)),
        })),
      };
    });
    void runBulk("bulk-move", () =>
      bulkMoveTasks({ moves: ids.map((taskId) => ({ taskId, toColumnId })) }),
    );
  }

  function bulkPriority(priority: Priority) {
    const ids = [...selectedIds];
    void runBulk("bulk-priority", () =>
      bulkUpdateTasks({ updates: ids.map((taskId) => ({ taskId, priority })) }),
    );
  }

  function bulkAddLabel(labelId: string) {
    const targets = allTasks.filter((t) => selectedIds.has(t.id));
    void runBulk("bulk-label", () =>
      Promise.all(
        targets.map((t) => {
          const ids = t.labels.map((l) => l.label.id);
          if (ids.includes(labelId)) return Promise.resolve(null);
          return setTaskLabels({ taskId: t.id, labelIds: [...ids, labelId] });
        }),
      ),
    );
  }

  function bulkAssign(userId: string) {
    const targets = allTasks.filter((t) => selectedIds.has(t.id));
    void runBulk("bulk-assign", () =>
      Promise.all(
        targets.map((t) => {
          const ids = t.assignees.map((a) => a.user.id);
          if (ids.includes(userId)) return Promise.resolve(null);
          return setTaskAssignees({ taskId: t.id, userIds: [...ids, userId] });
        }),
      ),
    );
  }

  function bulkArchive() {
    const ids = new Set(selectedIds);
    removeTasksLocally(ids);
    void runBulk("bulk-archive", () =>
      Promise.all(
        [...ids].map((taskId) => {
          const fd = new FormData();
          fd.set("taskId", taskId);
          return archiveTask(fd);
        }),
      ),
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <BoardTopBar
        board={board}
        members={workspaceMembers}
        savedViews={savedViews}
        currentUserId={currentUserId}
        onRenamed={(name) => setBoard((b) => ({ ...b, name }))}
        onLabelCreated={(label) =>
          setBoard((b) => ({ ...b, labels: [...b.labels, label] }))
        }
        onLabelUpdated={(label) =>
          setBoard((b) => ({
            ...b,
            labels: b.labels.map((l) =>
              l.id === label.id ? { ...l, ...label } : l,
            ),
            columns: b.columns.map((c) => ({
              ...c,
              tasks: c.tasks.map((t) => ({
                ...t,
                labels: t.labels.map((tl) =>
                  tl.label.id === label.id
                    ? { ...tl, label: { ...tl.label, ...label } }
                    : tl,
                ),
              })),
            })),
          }))
        }
        onLabelDeleted={(labelId) =>
          setBoard((b) => ({
            ...b,
            labels: b.labels.filter((l) => l.id !== labelId),
            columns: b.columns.map((c) => ({
              ...c,
              tasks: c.tasks.map((t) => ({
                ...t,
                labels: t.labels.filter((tl) => tl.label.id !== labelId),
              })),
            })),
          }))
        }
      />
      <DndContext
        id={`dnd-board-${board.id}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements: {
            onDragStart({ active }) {
              return `Picked up ${active.data.current?.type ?? "item"} ${active.id}.`;
            },
            onDragOver({ active, over }) {
              if (!over)
                return `${active.id} is no longer over a droppable area.`;
              return `${active.id} is over ${over.id}.`;
            },
            onDragEnd({ active, over }) {
              if (!over) return `${active.id} was dropped outside a droppable.`;
              return `${active.id} was dropped onto ${over.id}.`;
            },
            onDragCancel({ active }) {
              return `Dragging ${active.id} was cancelled.`;
            },
          },
        }}
      >
        <div className="flex flex-1 gap-3 overflow-x-auto px-4 pt-3 pb-6">
          <SortableContext
            items={columnIds}
            strategy={horizontalListSortingStrategy}
          >
            {board.columns.map((col, idx) => (
              <Column
                key={col.id}
                column={{
                  ...col,
                  tasks: sortTasks(filterTasks(col.tasks, filters), filters.sort),
                }}
                boardKind={board.kind}
                taskKeyPrefix={board.workspace.taskPrefix}
                isFirst={idx === 0}
                recentlyMovedTaskId={recentlyMovedTaskId}
                onOpenTask={handleOpenTask}
                selectedTaskIds={selectedIds}
                workspaceContacts={workspaceContacts}
                onTaskCreated={(task) =>
                  setBoard((b) => ({
                    ...b,
                    columns: b.columns.map((c) =>
                      c.id === col.id ? { ...c, tasks: [...c.tasks, task] } : c,
                    ),
                  }))
                }
                onArchived={(id) =>
                  setBoard((b) => ({
                    ...b,
                    columns: b.columns.filter((c) => c.id !== id),
                  }))
                }
              />
            ))}
          </SortableContext>
          <CreateColumn
            boardId={board.id}
            onCreated={(column) =>
              setBoard((b) => ({ ...b, columns: [...b.columns, column] }))
            }
          />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <DragOverlayCard
              task={activeTask}
              taskKeyPrefix={board.workspace.taskPrefix}
            />
          )}
          {activeColumn && (
            <div className="border-border bg-card ring-foreground/10 w-72 rounded-xl border p-3 shadow-lg ring-1">
              <div className="text-sm font-medium">{activeColumn.name}</div>
              <div className="text-muted-foreground mt-1 text-xs">
                {activeColumn.tasks.length} task
                {activeColumn.tasks.length === 1 ? "" : "s"}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <TaskDetailPanel
        task={openTask}
        boardId={board.id}
        boardKind={board.kind}
        taskKeyPrefix={board.workspace.taskPrefix}
        boardLabels={board.labels}
        boardColumns={board.columns.map((c) => ({ id: c.id, name: c.name }))}
        workspaceId={board.workspace.id}
        workspaceMembers={workspaceMembers}
        workspaceContacts={workspaceContacts}
        workspaceLinkTargets={workspaceLinkTargets}
        currentUserId={currentUserId}
        onClose={() => setOpenTaskId(null)}
        onPatchTask={patchBoardWithTask}
        onArchived={(taskId) => {
          setOpenTaskId(null);
          setBoard((b) => ({
            ...b,
            columns: b.columns.map((c) => ({
              ...c,
              tasks: c.tasks.filter((t) => t.id !== taskId),
            })),
          }));
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <BulkActionBar
        count={selectedIds.size}
        columns={board.columns.map((c) => ({ id: c.id, name: c.name }))}
        labels={board.labels.map((l) => ({ id: l.id, name: l.name }))}
        members={workspaceMembers}
        busy={bulkBusy}
        onMove={bulkMove}
        onPriority={bulkPriority}
        onAddLabel={bulkAddLabel}
        onAssign={bulkAssign}
        onArchive={bulkArchive}
        onClear={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
