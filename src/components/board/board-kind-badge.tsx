import {
  Bug,
  CircleDollarSign,
  KanbanSquare,
  LifeBuoy,
  Map,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { BoardKind } from "@/lib/enums";

const KIND_META: Record<
  BoardKind,
  { label: string; icon: LucideIcon; className: string }
> = {
  [BoardKind.TASKS]: {
    label: "Tasks",
    icon: KanbanSquare,
    className: "bg-muted text-muted-foreground",
  },
  [BoardKind.CRM]: {
    label: "CRM",
    icon: CircleDollarSign,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  [BoardKind.SUPPORT]: {
    label: "Support",
    icon: LifeBuoy,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  [BoardKind.BUGS]: {
    label: "Bugs",
    icon: Bug,
    className: "bg-red-500/10 text-red-700 dark:text-red-300",
  },
  [BoardKind.ROADMAP]: {
    label: "Roadmap",
    icon: Map,
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
};

export function BoardKindBadge({
  kind,
  size = "sm",
  className,
}: {
  kind: BoardKind;
  size?: "sm" | "xs";
  className?: string;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        meta.className,
        className,
      )}
    >
      <Icon className={size === "xs" ? "size-2.5" : "size-3"} />
      {meta.label}
    </span>
  );
}
