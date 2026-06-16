"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Pending, useSyncedTransition } from "@/components/sync";
import { moveTask } from "@/server/actions/tasks";

export function StatusSwitcher({
  taskId,
  currentColumnId,
  columns,
}: {
  taskId: string;
  currentColumnId: string;
  columns: { id: string; name: string }[];
}) {
  const { isPending, run } = useSyncedTransition();
  const [optimisticId, setOptimisticId] = useState(currentColumnId);
  const router = useRouter();

  const current =
    columns.find((c) => c.id === optimisticId) ??
    columns.find((c) => c.id === currentColumnId);

  async function move(toColumnId: string) {
    if (toColumnId === optimisticId) return;
    const prev = optimisticId;
    setOptimisticId(toColumnId);
    const result = await run("move-task", () =>
      moveTask({ taskId, toColumnId }),
    );
    if (result === null) {
      setOptimisticId(prev);
    } else {
      router.refresh();
    }
  }

  return (
    <Pending isPending={isPending} className="block">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              loading={isPending}
              className="gap-1.5"
            />
          }
        >
          <span className="bg-primary size-1.5 rounded-full" />
          <span className="text-xs font-medium">{current?.name ?? "—"}</span>
          <ChevronDown className="text-muted-foreground size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {columns.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onClick={() => move(c.id)}
              className="cursor-pointer"
            >
              <span
                className={
                  c.id === optimisticId
                    ? "bg-primary size-1.5 rounded-full"
                    : "bg-muted-foreground/40 size-1.5 rounded-full"
                }
              />
              {c.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Pending>
  );
}
