"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSyncedTransition } from "@/components/sync";
import { cn } from "@/lib/utils";
import {
  createSubtask,
  toggleSubtask,
  deleteSubtask,
} from "@/server/actions/subtasks";

type Subtask = {
  id: string;
  title: string;
  completed: boolean;
  position: number;
};

export function SubtaskList({
  taskId,
  subtasks: initial,
}: {
  taskId: string;
  subtasks: Subtask[];
}) {
  const [subtasks, setSubtasks] = useState<Subtask[]>(initial);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [recentId, setRecentId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const tx = useSyncedTransition();

  useEffect(() => {
    if (!recentId) return;
    const t = setTimeout(() => setRecentId(null), 700);
    return () => clearTimeout(t);
  }, [recentId]);

  function markPending(id: string, pending: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const done = subtasks.filter((s) => s.completed).length;
  const total = subtasks.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  async function submitNew() {
    const value = title.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    const optimisticId = `tmp-${Date.now()}`;
    setSubtasks((s) => [
      ...s,
      {
        id: optimisticId,
        title: value,
        completed: false,
        position: (s[s.length - 1]?.position ?? 0) + 1024,
      },
    ]);
    setTitle("");
    setAdding(false);
    markPending(optimisticId, true);
    const result = await tx.run("create-subtask", () =>
      createSubtask({ taskId, title: value }),
    );
    markPending(optimisticId, false);
    if (result) {
      setSubtasks((s) =>
        s.map((x) => (x.id === optimisticId ? { ...x, id: result.id } : x)),
      );
      setRecentId(result.id);
    } else {
      setSubtasks((s) => s.filter((x) => x.id !== optimisticId));
    }
  }

  function toggle(id: string, completed: boolean) {
    setSubtasks((s) => s.map((x) => (x.id === id ? { ...x, completed } : x)));
    markPending(id, true);
    tx.run("toggle-subtask", () =>
      toggleSubtask({ subtaskId: id, completed }),
    ).then((ok) => {
      markPending(id, false);
      if (ok === null) {
        setSubtasks((s) =>
          s.map((x) => (x.id === id ? { ...x, completed: !completed } : x)),
        );
      }
    });
  }

  function remove(id: string) {
    const prev = subtasks;
    markPending(id, true);
    tx.run("delete-subtask", () => deleteSubtask({ subtaskId: id })).then(
      (ok) => {
        if (ok !== null) {
          setSubtasks((s) => s.filter((x) => x.id !== id));
        } else {
          setSubtasks(prev);
        }
        markPending(id, false);
      },
    );
  }

  return (
    <div className="space-y-2">
      {total > 0 && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono tabular-nums">
            {done}/{total}
          </span>
        </div>
      )}

      <ul className="space-y-0.5">
        <AnimatePresence initial={false} mode="popLayout">
          {subtasks.map((s) => {
            const isPending = pendingIds.has(s.id);
            return (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  height: 0,
                  marginTop: 0,
                  marginBottom: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "group hover:bg-muted/40 flex items-center gap-2 rounded px-1 py-1 transition-opacity",
                  isPending && "pointer-events-none opacity-60",
                  s.id === recentId && "animate-saved-pulse-bg",
                )}
                aria-busy={isPending || undefined}
              >
                <Checkbox
                  checked={s.completed}
                  onCheckedChange={(v) => toggle(s.id, !!v)}
                  disabled={isPending}
                />
                <span
                  className={
                    s.completed
                      ? "text-muted-foreground flex-1 text-sm line-through"
                      : "flex-1 text-sm"
                  }
                >
                  {s.title}
                </span>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="text-muted-foreground hover:text-destructive invisible group-hover:visible"
                  aria-label="Delete subtask"
                  disabled={isPending}
                >
                  <Trash2 className="size-3" />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {adding ? (
        <div className="flex gap-1.5">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title.trim() && setAdding(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNew();
              if (e.key === "Escape") {
                setTitle("");
                setAdding(false);
              }
            }}
            placeholder="Subtask"
            className="h-7 text-sm"
            disabled={tx.isPending}
          />
          <Button
            size="sm"
            onClick={submitNew}
            loading={tx.isPending}
            loadingText="Add"
          >
            Add
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdding(true)}
          className="text-muted-foreground"
        >
          <Plus className="size-3" />
          Add subtask
        </Button>
      )}
    </div>
  );
}
