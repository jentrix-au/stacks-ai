"use client";

import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { AtSign, CalendarClock, MessageSquare, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { markNotificationsReadAction } from "@/server/actions/notifications";

export interface NotificationView {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  actorName: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  preview: string | null;
  href: string | null;
}

const TYPE_META: Record<string, { verb: string; icon: React.ElementType }> = {
  assigned: { verb: "assigned you", icon: UserPlus },
  mentioned: { verb: "mentioned you", icon: AtSign },
  commented: { verb: "commented on", icon: MessageSquare },
  due_soon: { verb: "due soon", icon: CalendarClock },
  sla_breached: { verb: "SLA breached on", icon: CalendarClock },
};

export function NotificationRow({
  notification: n,
}: {
  notification: NotificationView;
}) {
  const router = useRouter();
  const meta = TYPE_META[n.type] ?? {
    verb: n.type.replace(/_/g, " "),
    icon: MessageSquare,
  };
  const Icon = meta.icon;

  function open() {
    // Fire-and-forget mark-read, then navigate.
    if (!n.read) void markNotificationsReadAction({ ids: [n.id] });
    if (n.href) router.push(n.href);
  }

  return (
    <li>
      <button
        type="button"
        onClick={open}
        className={cn(
          "hover:bg-muted/50 flex w-full items-start gap-3 px-3 py-2.5 text-left",
          n.read && "opacity-60",
        )}
      >
        <span className="relative mt-0.5">
          <Icon className="text-muted-foreground size-4" />
          {!n.read && (
            <span
              data-testid="unread-dot"
              className="bg-primary absolute -top-0.5 -right-0.5 size-1.5 rounded-full"
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm">
            <span className="font-medium">{n.actorName ?? "Someone"}</span>{" "}
            <span className="text-muted-foreground">{meta.verb}</span>{" "}
            {n.taskKey && (
              <span className="font-mono text-xs">{n.taskKey}</span>
            )}{" "}
            <span className="truncate">{n.taskTitle}</span>
          </span>
          {n.preview && (
            <span className="text-muted-foreground mt-0.5 block truncate text-xs">
              “{n.preview}”
            </span>
          )}
        </span>
        <span className="text-muted-foreground mt-0.5 shrink-0 text-xs">
          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
        </span>
      </button>
    </li>
  );
}
