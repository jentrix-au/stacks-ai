"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity as ActivityIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ACTIVITY_VERBS as VERB } from "@/lib/activity-verbs";
import {
  ACTIVITY_SOURCE_FILTERS,
  agentIdentityOf,
  matchesSourceFilter,
  type ActivitySourceFilter,
} from "@/lib/activity-source";
import { cn } from "@/lib/utils";
import { AgentBadge } from "@/components/board/agent-badge";
import { fetchTaskActivity } from "@/server/actions/activity";
import type { TaskActivity } from "@/server/queries/activity";

export function ActivityFeed({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState<TaskActivity[] | null>(null);
  const [filter, setFilter] = useState<ActivitySourceFilter>("all");

  useEffect(() => {
    if (!open || activity) return;
    fetchTaskActivity(taskId)
      .then(setActivity)
      .catch((err) =>
        toast.error(
          err instanceof Error ? err.message : "Could not load activity",
        ),
      );
  }, [open, activity, taskId]);

  const visible =
    activity?.filter((a) => matchesSourceFilter(a.payload, filter)) ?? null;

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-md text-xs"
    >
      <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5">
        <ActivityIcon className="size-3" />
        Activity
      </summary>
      <div className="mt-3">
        {activity === null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="text-muted-foreground">No activity yet.</p>
        ) : (
          <>
            <div
              role="group"
              aria-label="Filter activity by source"
              className="mb-3 flex items-center gap-1"
            >
              {ACTIVITY_SOURCE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    filter === f.value
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {visible !== null && visible.length === 0 ? (
              <p className="text-muted-foreground">
                No activity from this source.
              </p>
            ) : (
              <ul className="space-y-2">
                {visible?.map((a) => {
                  const meta = VERB[a.type];
                  const Icon = meta?.icon ?? ActivityIcon;
                  const agent = agentIdentityOf(a.payload);
                  const source = (a.payload as { source?: string } | null)
                    ?.source;
                  return (
                    <li key={a.id} className="flex items-start gap-2">
                      <span className="bg-muted text-muted-foreground mt-1 flex size-5 shrink-0 items-center justify-center rounded-full">
                        <Icon className="size-3" />
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <Avatar className="size-4">
                            {a.actor?.image && (
                              <AvatarImage src={a.actor.image} alt="" />
                            )}
                            <AvatarFallback className="text-[8px]">
                              {(a.actor?.name ?? a.actor?.email ?? "•")
                                .charAt(0)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-foreground">
                            {a.actor?.name ?? a.actor?.email ?? "System"}
                          </span>
                          <span className="text-muted-foreground">
                            {meta?.label ?? a.type.toLowerCase()}
                          </span>
                          {agent ? (
                            <AgentBadge name={agent.name} emoji={agent.emoji} />
                          ) : source === "automation" ? (
                            <span
                              className="text-muted-foreground bg-muted rounded px-1 py-px text-[10px]"
                              title="Performed by an automation rule"
                            >
                              via ⚡ automation
                            </span>
                          ) : null}
                        </div>
                        <span className="text-muted-foreground">
                          {formatDistanceToNow(a.createdAt, {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </details>
  );
}
