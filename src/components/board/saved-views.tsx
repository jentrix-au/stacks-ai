"use client";

import { useState } from "react";
import { Bookmark, BookmarkPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSyncedTransition } from "@/components/sync";
import { createSavedView, deleteSavedView } from "@/server/actions/views";
import type { SavedViewSummary } from "@/server/views/operations";
import type { ViewFilters } from "@/server/views/schemas";
import { useBoardFilters } from "./board-filters";

function normalize(f: ViewFilters): string {
  return JSON.stringify({
    labels: [...f.labels].sort(),
    assignees: [...f.assignees].sort(),
    priorities: [...f.priorities].sort(),
    due: f.due ?? null,
    sort: f.sort ?? null,
  });
}

/** Saved-view chips (P3.4): apply on click, save the current filter state. */
export function SavedViews({
  boardId,
  initialViews,
  currentUserId,
}: {
  boardId: string;
  initialViews: SavedViewSummary[];
  currentUserId: string;
}) {
  const { filters, setFilters, isActive } = useBoardFilters();
  const [views, setViews] = useState(initialViews);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const saveTx = useSyncedTransition();

  const current = normalize(filters as ViewFilters);

  function apply(view: SavedViewSummary) {
    setFilters({
      labels: view.filters.labels,
      assignees: view.filters.assignees,
      priorities: view.filters.priorities,
      due: view.filters.due,
      sort: view.filters.sort,
    });
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const created = await saveTx.run("save-view", () =>
      createSavedView({
        boardId,
        name: trimmed,
        filters: filters as ViewFilters,
        shared,
      }),
    );
    if (created === null) return;
    setViews((v) => [...v, created]);
    setName("");
    setShared(false);
    setSaveOpen(false);
  }

  function remove(view: SavedViewSummary) {
    setViews((v) => v.filter((x) => x.id !== view.id));
    deleteSavedView({ viewId: view.id }).catch(() => {
      setViews((v) => [...v, view]);
      toast.error("Could not delete the view");
    });
  }

  if (views.length === 0 && !isActive()) return null;

  return (
    <div className="flex min-w-0 items-center gap-1">
      {views.map((view) => {
        const active = normalize(view.filters) === current;
        return (
          <span
            key={view.id}
            className={
              "group/view flex items-center overflow-hidden rounded-full border text-xs " +
              (active
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            <button
              type="button"
              onClick={() => apply(view)}
              className="flex items-center gap-1 py-0.5 pr-1 pl-2"
              title={view.shared ? "Shared view" : "Private view"}
            >
              <Bookmark className="size-3" />
              {view.name}
            </button>
            {view.createdById === currentUserId && (
              <button
                type="button"
                aria-label={`Delete view ${view.name}`}
                onClick={() => remove(view)}
                className="hover:text-destructive py-0.5 pr-1.5 pl-0.5 opacity-0 transition-opacity group-hover/view:opacity-100"
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        );
      })}

      {isActive() && (
        <Popover open={saveOpen} onOpenChange={setSaveOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground gap-1"
              />
            }
          >
            <BookmarkPlus className="size-3" />
            Save view
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-3 p-3">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              placeholder="View name"
              aria-label="View name"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="view-shared"
                checked={shared}
                onCheckedChange={(v) => setShared(v === true)}
              />
              <Label
                htmlFor="view-shared"
                className="text-muted-foreground text-xs font-normal"
              >
                Share with the board
              </Label>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={save}
              disabled={!name.trim()}
              loading={saveTx.isPending}
              loadingText="Saving…"
            >
              Save view
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
