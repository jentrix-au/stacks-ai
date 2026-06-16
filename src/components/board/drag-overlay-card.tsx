"use client";

import { Calendar, CheckSquare, MessageSquare, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PriorityDot } from "./priority-dot";
import type { FullTask } from "@/server/queries/boards";

export function DragOverlayCard({
  task,
  taskKeyPrefix,
}: {
  task: FullTask;
  taskKeyPrefix: string;
}) {
  return (
    <div className="border-border bg-card ring-foreground/10 w-[17rem] rotate-2 rounded-lg border p-2.5 shadow-2xl ring-1">
      {task.labels.length > 0 && (
        <div className="-mb-0.5 mb-2 flex flex-wrap gap-1">
          {task.labels.map(({ label }) => (
            <span
              key={label.id}
              className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      <h3 className="text-[13px] leading-snug font-medium">{task.title}</h3>
      <div className="text-muted-foreground mt-2 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/70 font-mono text-[10px]">
            {taskKeyPrefix}-{task.number}
          </span>
          <PriorityDot priority={task.priority} />
          {task.dueAt && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" />
              {format(task.dueAt, "MMM d")}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="size-3" />
              {task.subtasks.filter((s) => s.completed).length}/
              {task.subtasks.length}
            </span>
          )}
          {task._count.comments > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3" />
              {task._count.comments}
            </span>
          )}
          {task._count.attachments > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3" />
              {task._count.attachments}
            </span>
          )}
        </div>
        <div className="flex -space-x-1">
          {task.assignees.slice(0, 3).map(({ user }) => (
            <Avatar key={user.id} className="ring-card size-5 ring-2">
              {user.image && <AvatarImage src={user.image} alt="" />}
              <AvatarFallback className="text-[9px]">
                {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
      </div>
    </div>
  );
}
