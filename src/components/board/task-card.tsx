"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  Ban,
  Bug,
  Calendar,
  CircleDollarSign,
  MessageSquare,
  Paperclip,
  CheckSquare,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BoardKind, TaskLinkKind } from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { PriorityDot } from "./priority-dot";
import { useRelativeDate } from "./relative-date";
import type { FullTask } from "@/server/queries/boards";

export function TaskCard({
  task,
  boardKind,
  taskKeyPrefix,
  onOpen,
  selected = false,
  highlightOnEnter = false,
}: {
  task: FullTask;
  boardKind: BoardKind;
  taskKeyPrefix: string;
  /** shiftKey toggles multi-select (P3.8) instead of opening the panel. */
  onOpen: (taskId: string, shiftKey: boolean) => void;
  selected?: boolean;
  highlightOnEnter?: boolean;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "task" } });

  // dnd-kit owns transform/transition during drag and hides the original
  // (DragOverlay shows the floating preview). We hide via `visibility`
  // rather than `opacity` so framer-motion can fully own enter/exit
  // opacity animations without the inline style fighting back.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    visibility: isDragging ? ("hidden" as const) : undefined,
  };

  const subtasksDone = task.subtasks.filter((s) => s.completed).length;
  const subtasksTotal = task.subtasks.length;
  // Open BLOCKS edge pointing at this task (archived sources are already
  // filtered out of incomingLinks by the board query).
  const isBlocked = task.incomingLinks.some(
    (l) => l.kind === TaskLinkKind.BLOCKS,
  );

  return (
    <motion.li
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18 }}
    >
      <motion.button
        type="button"
        onClick={(e) => onOpen(task.id, e.shiftKey)}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.99 }}
        {...attributes}
        {...listeners}
        className={cn(
          "group/card border-border bg-card hover:border-foreground/15 hover:bg-card flex w-full cursor-grab flex-col gap-2 rounded-lg border p-2.5 text-left shadow-xs ring-0 transition-colors hover:shadow-sm active:cursor-grabbing",
          selected && "border-primary/60 ring-primary/30 ring-2",
          highlightOnEnter && "animate-saved-pulse-bg",
        )}
      >
        {task.labels.length > 0 && (
          <div className="-mb-0.5 flex flex-wrap gap-1">
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

        <div className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground/70 font-mono text-[10px]">
              {taskKeyPrefix}-{task.number}
            </span>
            <PriorityDot priority={task.priority} />
            {boardKind === BoardKind.CRM && task.deal?.amount != null && (
              <DealBadge
                amount={task.deal.amount}
                currency={task.deal.currency}
              />
            )}
            {boardKind === BoardKind.BUGS && task.bugReport?.severity && (
              <BugSeverityBadge
                severity={task.bugReport.severity}
                resolved={!!task.bugReport.resolvedAt}
              />
            )}
            {boardKind === BoardKind.SUPPORT && task.ticket?.slaDueAt && (
              <SlaBadge
                slaDueAt={task.ticket.slaDueAt}
                resolved={!!task.ticket.resolvedAt}
              />
            )}
            {isBlocked && <BlockedBadge />}
            <LinkBadges
              outgoingCount={task.outgoingLinks.length}
              incomingCount={task.incomingLinks.length}
            />
            {task.dueAt && <DueBadge date={task.dueAt} />}
            {subtasksTotal > 0 && (
              <span className="inline-flex items-center gap-1">
                <CheckSquare className="size-3" />
                {subtasksDone}/{subtasksTotal}
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
              <Avatar
                key={user.id}
                className="ring-card size-5 ring-2"
                title={user.name ?? user.email ?? ""}
              >
                {user.image && <AvatarImage src={user.image} alt="" />}
                <AvatarFallback className="text-[9px]">
                  {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {task.assignees.length > 3 && (
              <Badge
                variant="outline"
                className="ring-card size-5 justify-center rounded-full p-0 text-[9px] ring-2"
              >
                +{task.assignees.length - 3}
              </Badge>
            )}
          </div>
        </div>
      </motion.button>
    </motion.li>
  );
}

function DealBadge({
  amount,
  currency,
}: {
  amount: number;
  currency: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
      <CircleDollarSign className="size-3" />
      {formatMoney(amount, currency)}
    </span>
  );
}

const BUG_SEVERITY_STYLES: Record<string, string> = {
  TRIVIAL: "bg-muted text-muted-foreground",
  MINOR: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  MAJOR: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  CRITICAL: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  BLOCKER: "bg-red-500/10 text-red-700 dark:text-red-300",
};

function BugSeverityBadge({
  severity,
  resolved,
}: {
  severity: string;
  resolved: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        resolved
          ? "bg-muted text-muted-foreground line-through"
          : (BUG_SEVERITY_STYLES[severity] ?? "bg-muted text-muted-foreground"),
      )}
    >
      <Bug className="size-3" />
      {severity.charAt(0) + severity.slice(1).toLowerCase()}
    </span>
  );
}

function BlockedBadge() {
  return (
    <span className="bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
      <Ban className="size-3" />
      Blocked
    </span>
  );
}

function LinkBadges({
  outgoingCount,
  incomingCount,
}: {
  outgoingCount: number;
  incomingCount: number;
}) {
  if (outgoingCount === 0 && incomingCount === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
      {outgoingCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <ArrowDown className="size-3" />
          {outgoingCount}
        </span>
      )}
      {incomingCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <ArrowUp className="size-3" />
          {incomingCount}
        </span>
      )}
    </span>
  );
}

function SlaBadge({
  slaDueAt,
  resolved,
}: {
  slaDueAt: Date;
  resolved: boolean;
}) {
  const { label, overdue } = useRelativeDate(slaDueAt, "sla", resolved);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        resolved
          ? "bg-muted text-muted-foreground line-through"
          : overdue
            ? "bg-destructive/10 text-destructive"
            : "bg-sky-500/10 text-sky-700 dark:text-sky-300",
      )}
    >
      <AlarmClock className="size-3" />
      {label}
    </span>
  );
}

function DueBadge({ date }: { date: Date }) {
  const { label, overdue } = useRelativeDate(date);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        overdue
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground",
      )}
    >
      <Calendar className="size-3" />
      {label}
    </span>
  );
}
